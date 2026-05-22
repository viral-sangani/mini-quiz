import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  getPayoutToken,
  getPayoutTokenByAddress,
  type PublicPayout,
} from "@mini-quiz/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { awardBadge } from "./badge.service.js";
import { leaderboard } from "./room.service.js";
import { publishWorkerCommand } from "./worker-commands.js";

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(config.CELO_RPC_URL),
});

async function requestPayoutBroadcast(payoutId: string): Promise<void> {
  if (config.APP_ROLE === "worker" || config.APP_ROLE === "payout-worker") {
    await runPayoutBroadcast(payoutId);
    return;
  }
  const queued = await publishWorkerCommand({ type: "broadcast_payout", payoutId });
  if (!queued) await runPayoutBroadcast(payoutId);
}

export function treasuryAccount() {
  if (!config.TREASURY_PRIVATE_KEY) {
    throw new Error("TREASURY_PRIVATE_KEY is not configured");
  }
  return privateKeyToAccount(config.TREASURY_PRIVATE_KEY as Hex);
}

// Re-export only the constants the treasury service needs; the public
// client is recreated locally there to avoid tsc serialization of the
// nested viem inferred type when crossing module boundaries.
export { ERC20_TRANSFER_ABI };

// Auto-disburse on quiz end. Creates one Payout per prize rank and broadcasts
// the on-chain transfer in the same call — admin does not approve.
// Idempotent via @@unique([quizId, rank]); safe to call from a manual override
// route after the scheduler has already run for the quiz.
export async function enqueueAutoPayouts(quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return;
  // Resolve the prize token from the quiz row — defaults to USDT for older
  // rows via the schema default. Native CELO stores the empty string in
  // tokenAddress; lookups round-trip via getPayoutTokenByAddress.
  const token = getPayoutToken(quiz.payoutToken);
  const tokenAddressForRow = token.isNative ? "" : (token.address ?? "");
  const winnersCount = quiz.prizeAmounts.length;
  const { rows } = await leaderboard(quizId, {
    limit: Math.max(1, winnersCount),
    capLimit: false,
  });
  const payoutCount = Math.min(winnersCount, rows.length);
  for (let i = 0; i < payoutCount; i++) {
    const rank = i + 1;
    const row = rows[i];
    if (!row) continue;
    const amount = quiz.prizeAmounts[i];
    if (!amount || Number(amount) <= 0) continue;

    // Skip if this rank was already paid (e.g. manual /end after scheduler).
    const existing = await prisma.payout.findUnique({
      where: { quizId_rank: { quizId, rank } },
    });
    if (existing) continue;

    if (!row.walletAddress) {
      const failed = await prisma.payout.create({
        data: {
          quizId,
          userId: row.userId,
          rank,
          amount,
          tokenAddress: tokenAddressForRow,
          status: "FAILED",
          failureReason: "Winner has no walletAddress",
        },
      });
      broadcast(quizId, {
        type: "payout_failed",
        payoutId: failed.id,
        rank,
        userId: row.userId,
        amount,
        reason: "no_wallet",
      });
      continue;
    }

    const payout = await prisma.payout.create({
      data: {
        quizId,
        userId: row.userId,
        rank,
        amount,
        tokenAddress: tokenAddressForRow,
        status: "APPROVED",
      },
    });
    broadcast(quizId, {
      type: "payout_pending",
      payoutId: payout.id,
      rank,
      userId: row.userId,
      amount,
    });
    // Fire on-chain transfer in the worker when Redis is available; local/dev
    // without Redis falls back to inline background processing.
    void requestPayoutBroadcast(payout.id);
  }
}

// Sign + broadcast an APPROVED payout. Splits the chain-side work out of
// approvePayout so both the auto-disburse path and the manual retry path
// can share it.
export async function runPayoutBroadcast(payoutId: string): Promise<void> {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { user: true },
  });
  if (!payout || payout.status !== "APPROVED") return;
  if (!payout.user.walletAddress) {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failureReason: "Winner has no walletAddress" },
    });
    return;
  }

  // Resolve which token this payout is in. Stored tokenAddress is the
  // ERC-20 contract for USDC/USDT, or empty/"celo" for native CELO.
  const token = getPayoutTokenByAddress(payout.tokenAddress);
  if (!token) {
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "FAILED",
        failureReason: `Unknown payout token address: ${payout.tokenAddress}`,
      },
    });
    return;
  }

  let txHash: Hex;
  try {
    const account = treasuryAccount();
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(config.CELO_RPC_URL),
    });
    const winner = payout.user.walletAddress as Address;
    const value = parseUnits(payout.amount, token.decimals);
    if (token.isNative) {
      // Native CELO: gas paid in CELO, no feeCurrency override.
      txHash = await walletClient.sendTransaction({
        to: winner,
        value,
      } as Parameters<typeof walletClient.sendTransaction>[0]);
    } else {
      // ERC-20 prize transfer: omit feeCurrency so gas is paid in CELO.
      // Paying gas in the same token can drain a "just enough" USDT/USDC
      // balance before transfer(), causing an exceeds-balance revert.
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [winner, value],
      });
      txHash = await walletClient.sendTransaction({
        to: token.address!,
        data,
      } as Parameters<typeof walletClient.sendTransaction>[0]);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failureReason: reason },
    });
    broadcast(payout.quizId, {
      type: "payout_failed",
      payoutId: payout.id,
      rank: payout.rank,
      userId: payout.userId,
      amount: payout.amount,
      reason,
    });
    return;
  }

  await prisma.payout.update({
    where: { id: payoutId },
    data: { status: "BROADCAST", txHash },
  });
  broadcast(payout.quizId, {
    type: "payout_approved",
    payoutId: payout.id,
    rank: payout.rank,
    userId: payout.userId,
    amount: payout.amount,
    txHash,
  });
  void confirmPayoutInBackground(payout.id);
}

// Manual retry for a FAILED payout. Resets status → APPROVED and re-broadcasts.
// Used by the admin "Retry" button in the design.
export async function retryFailedPayout(
  payoutId: string,
  adminUserId: string,
): Promise<{ status: string; error?: string }> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { status: "error", error: "Payout not found" };
  if (payout.status !== "FAILED") {
    return { status: payout.status, error: `Payout is ${payout.status}` };
  }
  await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: "APPROVED",
      approvedById: adminUserId,
      failureReason: null,
      txHash: null,
      confirmedAt: null,
    },
  });
  await requestPayoutBroadcast(payoutId);
  const fresh = await prisma.payout.findUnique({ where: { id: payoutId } });
  return { status: fresh?.status ?? "APPROVED" };
}

// Admin manually approves a stuck PENDING payout (legacy rows from before
// auto-disburse) or retries a FAILED one. Both routes converge through
// runPayoutBroadcast above.
export async function approvePayout(
  payoutId: string,
  adminUserId: string,
): Promise<{ status: string; txHash?: string; error?: string }> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { status: "error", error: "Payout not found" };

  if (payout.status === "FAILED") {
    return retryFailedPayout(payoutId, adminUserId);
  }
  if (payout.status !== "PENDING") {
    return { status: payout.status, error: `Payout is ${payout.status}` };
  }

  await prisma.payout.update({
    where: { id: payoutId },
    data: { status: "APPROVED", approvedById: adminUserId },
  });
  await requestPayoutBroadcast(payoutId);
  const fresh = await prisma.payout.findUnique({ where: { id: payoutId } });
  return {
    status: fresh?.status ?? "APPROVED",
    txHash: fresh?.txHash ?? undefined,
    error: fresh?.failureReason ?? undefined,
  };
}

export async function confirmPayoutInBackground(payoutId: string): Promise<void> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout?.txHash) return;
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: payout.txHash as Hex,
      timeout: 90_000,
    });
    if (receipt.status === "success") {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
      broadcast(payout.quizId, {
        type: "payout_confirmed",
        payoutId: payout.id,
        rank: payout.rank,
        userId: payout.userId,
        amount: payout.amount,
        txHash: payout.txHash,
      });
      // Award first_usdt the first time a player has any CONFIRMED payout.
      try {
        await awardBadge(payout.userId, "first_usdt");
      } catch {
        // Idempotent; ignore.
      }
    } else {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "FAILED", failureReason: "Transaction reverted" },
      });
      broadcast(payout.quizId, {
        type: "payout_failed",
        payoutId: payout.id,
        rank: payout.rank,
        userId: payout.userId,
        amount: payout.amount,
        reason: "Transaction reverted",
      });
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failureReason: reason },
    });
    broadcast(payout.quizId, {
      type: "payout_failed",
      payoutId: payout.id,
      rank: payout.rank,
      userId: payout.userId,
      amount: payout.amount,
      reason,
    });
  }
}

// On backend startup, re-check any payouts stuck in BROADCAST state from a
// previous crash — we had a txHash, we just didn't see the receipt.
export async function resumeInFlightPayouts(): Promise<void> {
  const rows = await prisma.payout.findMany({ where: { status: "BROADCAST" } });
  for (const r of rows) void confirmPayoutInBackground(r.id);
}

export async function listPayoutsForQuiz(quizId: string): Promise<PublicPayout[]> {
  const rows = await prisma.payout.findMany({
    where: { quizId },
    include: { user: true },
    orderBy: { rank: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    rank: p.rank,
    amount: p.amount,
    tokenAddress: p.tokenAddress,
    status: p.status,
    txHash: p.txHash,
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    userId: p.userId,
    displayName: p.user.displayName ?? "Player",
    walletAddress: p.user.walletAddress,
  }));
}
