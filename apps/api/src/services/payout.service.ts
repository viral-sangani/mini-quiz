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
  PRIZE_FEE_CURRENCY_ADDRESS,
  PRIZE_TOKEN_ADDRESS,
  PRIZE_TOKEN_DECIMALS,
  type PublicPayout,
} from "@mini-quiz/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { awardBadge } from "./badge.service.js";
import { leaderboard } from "./room.service.js";

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

function treasuryAccount() {
  if (!config.TREASURY_PRIVATE_KEY) {
    throw new Error("TREASURY_PRIVATE_KEY is not configured");
  }
  return privateKeyToAccount(config.TREASURY_PRIVATE_KEY as Hex);
}

// Auto-disburse on quiz end. Creates one Payout per prize rank and broadcasts
// the on-chain transfer in the same call — admin does not approve.
// Idempotent via @@unique([quizId, rank]); safe to call from a manual override
// route after the scheduler has already run for the quiz.
export async function enqueueAutoPayouts(quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return;
  const rows = await leaderboard(quizId);
  const winnersCount = Math.min(quiz.prizeAmounts.length, rows.length);
  for (let i = 0; i < winnersCount; i++) {
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
          tokenAddress: PRIZE_TOKEN_ADDRESS,
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
        tokenAddress: PRIZE_TOKEN_ADDRESS,
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
    // Fire on-chain transfer in the background; receipt confirmation flows
    // through confirmPayoutInBackground via broadcastPayout below.
    void broadcastPayout(payout.id);
  }
}

// Sign + broadcast an APPROVED payout. Splits the chain-side work out of
// approvePayout so both the auto-disburse path and the manual retry path
// can share it.
async function broadcastPayout(payoutId: string): Promise<void> {
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

  let txHash: Hex;
  try {
    const account = treasuryAccount();
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(config.CELO_RPC_URL),
    });
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [
        payout.user.walletAddress as Address,
        parseUnits(payout.amount, PRIZE_TOKEN_DECIMALS),
      ],
    });
    txHash = await walletClient.sendTransaction({
      to: PRIZE_TOKEN_ADDRESS,
      data,
      feeCurrency: PRIZE_FEE_CURRENCY_ADDRESS,
    } as Parameters<typeof walletClient.sendTransaction>[0]);
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
  await broadcastPayout(payoutId);
  const fresh = await prisma.payout.findUnique({ where: { id: payoutId } });
  return { status: fresh?.status ?? "APPROVED" };
}

// Admin manually approves a stuck PENDING payout (legacy rows from before
// auto-disburse) or retries a FAILED one. Both routes converge through
// broadcastPayout above.
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
  await broadcastPayout(payoutId);
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
