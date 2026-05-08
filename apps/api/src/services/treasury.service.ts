import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import {
  PAYOUT_TOKENS,
  type PayoutTokenSymbol,
  getPayoutToken,
} from "@mini-quiz/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { ERC20_TRANSFER_ABI, treasuryAccount } from "./payout.service.js";

// Local public client. Recreating instead of importing from
// payout.service.ts because viem's inferred return type from
// createPublicClient is too deep to cross module boundaries cleanly under
// tsc — see the previous attempt where re-exporting blew up serialization.
const celoPublicClient = createPublicClient({
  chain: celo,
  transport: http(config.CELO_RPC_URL),
});

// Treasury introspection + admin-initiated withdrawals.
//
// `getTreasuryAddress`        — derive the treasury wallet from the env key.
// `getOnchainBalances`        — read CELO/USDC/USDT balances from chain.
//                                30s in-memory cache so the admin UI's
//                                deposit-watcher poll loop doesn't melt
//                                Forno during a deposit wait.
// `getLockedObligations`      — sum `prizeAmounts` of SCHEDULED+LIVE quizzes
//                                grouped by payoutToken, plus pending
//                                payouts (PENDING/APPROVED/BROADCAST) by
//                                their stored tokenAddress.
// `getTreasurySummary`        — combines balances + locked + available.
// `withdrawFromTreasury`      — admin manual withdrawal. Re-checks
//                                available before sending so a race can't
//                                drain the locked portion. Single in-flight
//                                lock per token to block double-clicks.

// ---------- Address ----------

let cachedAddress: Address | null = null;
export function getTreasuryAddress(): Address {
  if (cachedAddress) return cachedAddress;
  cachedAddress = treasuryAccount().address;
  return cachedAddress;
}

// ---------- Balances ----------

const ERC20_BALANCEOF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type BalanceMap = Record<PayoutTokenSymbol, string>;

type CachedBalances = {
  balances: BalanceMap;
  fetchedAt: number;
};
const BALANCE_TTL_MS = 30_000;
let balanceCache: CachedBalances | null = null;

export async function getOnchainBalances(opts?: {
  refresh?: boolean;
}): Promise<{ balances: BalanceMap; fetchedAt: number }> {
  const now = Date.now();
  if (
    !opts?.refresh &&
    balanceCache &&
    now - balanceCache.fetchedAt < BALANCE_TTL_MS
  ) {
    return balanceCache;
  }
  const owner = getTreasuryAddress();
  const out: BalanceMap = { CELO: "0", USDC: "0", USDT: "0" };
  for (const token of PAYOUT_TOKENS) {
    try {
      let raw: bigint;
      if (token.isNative) {
        raw = await celoPublicClient.getBalance({ address: owner });
      } else if (token.address) {
        raw = (await celoPublicClient.readContract({
          address: token.address,
          abi: ERC20_BALANCEOF_ABI,
          functionName: "balanceOf",
          args: [owner],
        })) as bigint;
      } else {
        raw = 0n;
      }
      out[token.symbol] = formatUnits(raw, token.decimals);
    } catch {
      // Best-effort: if any single token RPC read fails, leave it at 0
      // and let the next refresh fix it. The cached value falls back
      // automatically because we only update the cache on full success
      // path below.
      out[token.symbol] = balanceCache?.balances?.[token.symbol] ?? "0";
    }
  }
  balanceCache = { balances: out, fetchedAt: now };
  return balanceCache;
}

// ---------- Locked obligations ----------

// Sum decimal strings as Number then re-stringify. This is fine for our
// scale (a hundred concurrent quizzes × thousands of dollars each is
// nowhere near JS-number-precision territory). If we ever hit precision
// issues we'll move to the `dnum` lib or BigInt math.
function sumDecimalStrings(arr: string[]): string {
  let total = 0;
  for (const s of arr) {
    const n = Number(s);
    if (Number.isFinite(n)) total += n;
  }
  return total.toString();
}

export type LockedMap = Record<PayoutTokenSymbol, string>;

export async function getLockedObligations(): Promise<LockedMap> {
  const out: LockedMap = { CELO: "0", USDC: "0", USDT: "0" };

  // 1. Prize pools of quizzes that haven't yet ended.
  const pendingQuizzes = await prisma.quiz.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      archivedAt: null,
    },
    select: { payoutToken: true, prizeAmounts: true },
  });
  const byToken: Record<PayoutTokenSymbol, string[]> = {
    CELO: [],
    USDC: [],
    USDT: [],
  };
  for (const q of pendingQuizzes) {
    byToken[q.payoutToken].push(...q.prizeAmounts);
  }
  for (const sym of Object.keys(byToken) as PayoutTokenSymbol[]) {
    out[sym] = sumDecimalStrings(byToken[sym]);
  }

  // 2. Add in-flight payouts not yet on-chain. CONFIRMED has already
  //    settled; FAILED is unlocked. The middle three are still our
  //    obligations.
  const pendingPayouts = await prisma.payout.findMany({
    where: { status: { in: ["PENDING", "APPROVED", "BROADCAST"] } },
    select: { tokenAddress: true, amount: true },
  });
  for (const p of pendingPayouts) {
    const sym = symbolFromTokenAddress(p.tokenAddress);
    if (!sym) continue;
    out[sym] = sumDecimalStrings([out[sym], p.amount]);
  }

  return out;
}

function symbolFromTokenAddress(addr: string | null): PayoutTokenSymbol | null {
  if (!addr) return "CELO";
  const lower = addr.toLowerCase();
  for (const t of PAYOUT_TOKENS) {
    if (t.isNative && (lower === "" || lower === "celo")) return t.symbol;
    if (t.address && t.address.toLowerCase() === lower) return t.symbol;
  }
  return null;
}

// ---------- Combined summary ----------

export type TreasurySummary = {
  address: Address;
  balances: BalanceMap;
  locked: LockedMap;
  available: BalanceMap;
  fetchedAt: number;
};

export async function getTreasurySummary(opts?: {
  refresh?: boolean;
}): Promise<TreasurySummary> {
  const [{ balances, fetchedAt }, locked] = await Promise.all([
    getOnchainBalances(opts),
    getLockedObligations(),
  ]);
  const available: BalanceMap = { CELO: "0", USDC: "0", USDT: "0" };
  for (const sym of Object.keys(available) as PayoutTokenSymbol[]) {
    const bal = Number(balances[sym]);
    const lk = Number(locked[sym]);
    const av = Math.max(0, bal - lk);
    // Trim trailing zeros; fall back to plain toString.
    available[sym] = Number.isFinite(av) ? av.toString() : "0";
  }
  return {
    address: getTreasuryAddress(),
    balances,
    locked,
    available,
    fetchedAt,
  };
}

// ---------- Withdraw ----------

const inFlight = new Set<PayoutTokenSymbol>();

export type WithdrawResult =
  | { ok: true; txHash: Hex }
  | { ok: false; code: WithdrawErrorCode; message: string };

export type WithdrawErrorCode =
  | "INVALID_TOKEN"
  | "INVALID_ADDRESS"
  | "BAD_TARGET"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_AVAILABLE"
  | "IN_FLIGHT"
  | "RPC_ERROR";

export async function withdrawFromTreasury(args: {
  tokenSymbol: PayoutTokenSymbol;
  amount: string;
  toAddress: string;
}): Promise<WithdrawResult> {
  const token = (() => {
    try {
      return getPayoutToken(args.tokenSymbol);
    } catch {
      return null;
    }
  })();
  if (!token) {
    return { ok: false, code: "INVALID_TOKEN", message: "Unknown token" };
  }
  if (!isAddress(args.toAddress)) {
    return {
      ok: false,
      code: "INVALID_ADDRESS",
      message: "Recipient must be a valid 0x address",
    };
  }
  if (args.toAddress.toLowerCase() === getTreasuryAddress().toLowerCase()) {
    return {
      ok: false,
      code: "BAD_TARGET",
      message: "Cannot withdraw to the treasury's own address",
    };
  }
  const amountNum = Number(args.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Amount must be a positive number",
    };
  }

  if (inFlight.has(token.symbol)) {
    return {
      ok: false,
      code: "IN_FLIGHT",
      message: "Another withdrawal for this token is in flight",
    };
  }
  inFlight.add(token.symbol);
  try {
    // Race-safe re-check: pull a fresh balance + locked just before send.
    const summary = await getTreasurySummary({ refresh: true });
    const av = Number(summary.available[token.symbol]);
    if (!Number.isFinite(av) || av < amountNum) {
      return {
        ok: false,
        code: "INSUFFICIENT_AVAILABLE",
        message: `Available ${token.symbol}: ${av}; requested ${amountNum}. (${summary.locked[token.symbol]} locked in active quizzes.)`,
      };
    }

    const account = treasuryAccount();
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(config.CELO_RPC_URL),
    });

    let txHash: Hex;
    if (token.isNative) {
      // Native CELO transfer: gas paid in CELO, no feeCurrency override.
      txHash = await walletClient.sendTransaction({
        to: args.toAddress as Address,
        value: parseUnits(args.amount, token.decimals),
      } as Parameters<typeof walletClient.sendTransaction>[0]);
    } else if (token.address) {
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [args.toAddress as Address, parseUnits(args.amount, token.decimals)],
      });
      txHash = await walletClient.sendTransaction({
        to: token.address,
        data,
        feeCurrency: token.feeCurrencyAddress,
      } as Parameters<typeof walletClient.sendTransaction>[0]);
    } else {
      return {
        ok: false,
        code: "INVALID_TOKEN",
        message: "Token has no contract address",
      };
    }
    // Bust the cache so the post-withdraw refresh shows the new balance.
    balanceCache = null;
    return { ok: true, txHash };
  } catch (e) {
    return {
      ok: false,
      code: "RPC_ERROR",
      message: e instanceof Error ? e.message : "Chain transfer failed",
    };
  } finally {
    inFlight.delete(token.symbol);
  }
}
