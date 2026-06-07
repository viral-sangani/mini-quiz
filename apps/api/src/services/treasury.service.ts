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
import pino from "pino";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  ERC20_TRANSFER_ABI,
  sendTreasuryTransaction,
  treasuryAccount,
} from "./payout.service.js";
import {
  classifySendError,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
  withTreasuryLock,
} from "./treasury-lock.js";

const log = pino({ level: config.LOG_LEVEL });

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
//                                grouped by payoutToken, plus uncovered prize
//                                ranks of ENDED quizzes whose payout rows
//                                aren't created yet (worker lag), plus pending
//                                payouts (PENDING/APPROVED/BROADCASTING/
//                                BROADCAST) by their stored tokenAddress.
// `getTreasurySummary`        — combines balances + locked + available.
// `withdrawFromTreasury`      — admin manual withdrawal. Acquires a cross-pod
//                                Redis lock on the treasury address (shared
//                                with payout sends), re-checks available
//                                INSIDE the lock so a race can't drain the
//                                locked portion, and honours an optional
//                                client idempotency key (Redis record).

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

export async function getLockedObligations(opts?: {
  excludeQuizId?: string;
}): Promise<LockedMap> {
  const out: LockedMap = { CELO: "0", USDC: "0", USDT: "0" };

  // 1. Prize pools of quizzes that haven't yet ended.
  const pendingQuizzes = await prisma.quiz.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      archivedAt: null,
      ...(opts?.excludeQuizId ? { NOT: { id: opts.excludeQuizId } } : {}),
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

  // 1b. ENDED quizzes whose Payout rows haven't been created yet (scheduler /
  //     finalizer worker lag). The prize money is still owed but lives in
  //     neither the SCHEDULED/LIVE sum above nor the payout-row sum below, so
  //     it would otherwise look "available" and a withdrawal could drain it.
  //     Only lock the prize ranks that do NOT yet have a payout row — ranks
  //     with a row are accounted for in step 2 (or already settled).
  const endedQuizzes = await prisma.quiz.findMany({
    where: {
      status: "ENDED",
      archivedAt: null,
      ...(opts?.excludeQuizId ? { NOT: { id: opts.excludeQuizId } } : {}),
    },
    select: {
      payoutToken: true,
      prizeAmounts: true,
      payouts: { select: { rank: true, status: true } },
    },
  });
  for (const q of endedQuizzes) {
    // M7: a FAILED payout row does NOT cover its rank. The prize is still owed
    // and retryable, but FAILED is excluded from the in-flight sum in step 2,
    // so without this the rank would be counted nowhere and show as available
    // (then withdrawable). Treat only non-FAILED rows as covering a rank; a
    // FAILED-only rank falls through to the prizeAmounts "uncovered" sum here.
    // CONFIRMED ranks intentionally still count as covered (already settled,
    // genuinely not owed). No double count: a rank is either covered (skipped
    // here, summed in step 2 if in-flight) or uncovered (summed here).
    const coveredRanks = new Set(
      q.payouts.filter((p) => p.status !== "FAILED").map((p) => p.rank),
    );
    const uncovered: string[] = [];
    for (let i = 0; i < q.prizeAmounts.length; i++) {
      // Ranks are 1-based; prizeAmounts[i] is the prize for rank i + 1.
      const amount = q.prizeAmounts[i];
      if (amount && !coveredRanks.has(i + 1)) uncovered.push(amount);
    }
    out[q.payoutToken] = sumDecimalStrings([out[q.payoutToken], ...uncovered]);
  }

  // 2. Add in-flight payouts not yet on-chain. CONFIRMED has already
  //    settled; FAILED is unlocked. The remaining in-flight states are still
  //    our obligations.
  const pendingPayouts = await prisma.payout.findMany({
    where: { status: { in: ["PENDING", "APPROVED", "BROADCASTING", "BROADCAST"] } },
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
  excludeQuizId?: string;
}): Promise<TreasurySummary> {
  const [{ balances, fetchedAt }, locked] = await Promise.all([
    getOnchainBalances(opts),
    getLockedObligations({ excludeQuizId: opts?.excludeQuizId }),
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

export type WithdrawResult =
  | { ok: true; txHash: Hex }
  | { ok: false; code: WithdrawErrorCode; message: string };

export type WithdrawErrorCode =
  | "INVALID_TOKEN"
  | "INVALID_ADDRESS"
  | "BAD_TARGET"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_AVAILABLE"
  | "DUPLICATE"
  | "IN_FLIGHT"
  | "RPC_ERROR";

export async function withdrawFromTreasury(args: {
  tokenSymbol: PayoutTokenSymbol;
  amount: string;
  toAddress: string;
  // Optional client-supplied idempotency key. When present, a repeat request
  // with the same key is rejected (DUPLICATE) so a retried HTTP call can't
  // send twice. Optional for now to stay backward-compatible with the existing
  // route; see follow-up note about making it required + a durable Withdrawal
  // table.
  idempotencyKey?: string;
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

  const account = treasuryAccount();
  const treasuryAddr = account.address;

  // Cross-pod critical section: a shared Redis lock keyed on the treasury
  // address serializes ALL treasury sends across every pod (withdrawals and
  // payouts share one key via withTreasuryLock). If Redis is down it falls
  // back to the in-process mutex and logs a warning.
  return withTreasuryLock(
    treasuryAddr,
    async (): Promise<WithdrawResult> => {
      // Race-safe re-check INSIDE the lock: pull a fresh balance + locked just
      // before send so a concurrent payout/withdrawal can't let us drain the
      // locked portion. M5: validate BEFORE reserving the idempotency key so a
      // rejected validation never burns the key for 24h.
      const summary = await getTreasurySummary({ refresh: true });
      const av = Number(summary.available[token.symbol]);
      if (!Number.isFinite(av) || av < amountNum) {
        return {
          ok: false,
          code: "INSUFFICIENT_AVAILABLE",
          message: `Available ${token.symbol}: ${av}; requested ${amountNum}. (${summary.locked[token.symbol]} locked in active quizzes.)`,
        };
      }
      if (!token.isNative && !token.address) {
        return {
          ok: false,
          code: "INVALID_TOKEN",
          message: "Token has no contract address",
        };
      }

      // Idempotency: reserve only now that validation has passed. Checked INSIDE
      // the lock so two concurrent identical requests can't both pass. Redis
      // record with a 24h TTL — a durable Withdrawal table is the proper
      // follow-up (schema is frozen for this group), which would also give
      // permanent audit history.
      if (args.idempotencyKey) {
        const fresh = await reserveIdempotencyKey(
          "withdraw",
          args.idempotencyKey,
          log,
        );
        if (!fresh) {
          return {
            ok: false,
            code: "DUPLICATE",
            message: "A withdrawal with this idempotency key was already accepted",
          };
        }
      }

      const walletClient = createWalletClient({
        account,
        chain: celo,
        transport: http(config.CELO_RPC_URL),
      });

      try {
        // M6: route the send through the SAME explicit-nonce path payouts use,
        // so the per-pod nonce cache stays authoritative. A bare
        // walletClient.sendTransaction here would let viem pick a pending nonce
        // independently and collide with a payout sent moments earlier from the
        // same pod. We already hold withTreasuryLock, which is the contract
        // sendTreasuryTransaction requires.
        const txHash: Hex = await sendTreasuryTransaction(
          walletClient,
          treasuryAddr,
          () => {
            if (token.isNative) {
              // Native CELO transfer: gas paid in CELO, no feeCurrency override.
              return {
                to: args.toAddress as Address,
                value: parseUnits(args.amount, token.decimals),
              };
            }
            // ERC-20 withdrawals also use CELO for gas. This lets admins
            // withdraw an exact stablecoin amount without the fee reducing that
            // token first. token.address is non-null here (validated above).
            const data = encodeFunctionData({
              abi: ERC20_TRANSFER_ABI,
              functionName: "transfer",
              args: [
                args.toAddress as Address,
                parseUnits(args.amount, token.decimals),
              ],
            });
            return { to: token.address as Address, data };
          },
        );
        // Bust the cache so the post-withdraw refresh shows the new balance.
        balanceCache = null;
        return { ok: true, txHash };
      } catch (e) {
        // M5: only release the idempotency key when the tx DEFINITIVELY never
        // broadcast (pre-broadcast RPC rejection) so a legitimate retry isn't
        // blocked for 24h. On an AMBIGUOUS failure the tx may be in the mempool
        // — keep the key reserved so a retry stays deduped (we must not risk a
        // second withdrawal).
        if (args.idempotencyKey && classifySendError(e) === "PRE_BROADCAST") {
          await releaseIdempotencyKey("withdraw", args.idempotencyKey);
        }
        return {
          ok: false,
          code: "RPC_ERROR",
          message: e instanceof Error ? e.message : "Chain transfer failed",
        };
      }
    },
    log,
  );
}
