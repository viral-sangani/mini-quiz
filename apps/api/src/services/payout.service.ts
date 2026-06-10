import pino from "pino";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  parseUnits,
  WaitForTransactionReceiptTimeoutError,
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
import {
  classifySendError,
  commitNonce,
  getNextNonce,
  isNonceError,
  resetNonce,
  withTreasuryLock,
} from "./treasury-lock.js";
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

const log = pino({ level: config.LOG_LEVEL });

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestPayoutBroadcast(payoutId: string): Promise<void> {
  if (config.APP_ROLE === "worker" || config.APP_ROLE === "payout-worker") {
    await runPayoutBroadcast(payoutId);
    return;
  }
  const queued = await publishWorkerCommand({ type: "broadcast_payout", payoutId });
  if (!queued) await runPayoutBroadcast(payoutId);
}

async function requestQuizPayoutBroadcast(quizId: string): Promise<void> {
  if (config.APP_ROLE === "worker" || config.APP_ROLE === "payout-worker") {
    await runQuizPayoutBroadcast(quizId);
    return;
  }
  const queued = await publishWorkerCommand({ type: "broadcast_quiz_payouts", quizId });
  if (!queued) await runQuizPayoutBroadcast(quizId);
}

async function waitForSenderNonce(
  address: Address,
  targetNonce: number,
): Promise<void> {
  const deadline = Date.now() + config.PAYOUT_BURST_WINDOW_NONCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const nonce = await publicClient.getTransactionCount({ address });
    if (nonce >= targetNonce) return;
    await sleep(config.PAYOUT_BURST_WINDOW_NONCE_POLL_MS);
  }
  throw new Error(`Timed out waiting for treasury nonce to reach ${targetNonce}`);
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
  let approvedCreated = 0;
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
    approvedCreated++;
    broadcast(quizId, {
      type: "payout_pending",
      payoutId: payout.id,
      rank,
      userId: row.userId,
      amount,
    });
  }
  // Fire the quiz's approved payout rows as one nonce-managed burst. This
  // preserves one ledger row + tx hash per winner, but avoids queueing 500
  // worker commands that would serialize the whole payout run.
  if (approvedCreated > 0) void requestQuizPayoutBroadcast(quizId);
}

// Sign + broadcast an APPROVED payout. Splits the chain-side work out of
// approvePayout so both the auto-disburse path and the manual retry path
// can share it.
export async function runPayoutBroadcast(payoutId: string): Promise<void> {
  // Atomically CLAIM the row before doing any chain work. Only the caller that
  // flips APPROVED -> BROADCASTING wins; every other concurrent or duplicate
  // invocation (admin double-click, retry race, two pods) sees count === 0 and
  // bails, so a single payout can never be signed + sent twice.
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "APPROVED" },
    data: { status: "BROADCASTING" },
  });
  if (claimed.count === 0) return;

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { user: true },
  });
  if (!payout) return;

  // Defensive: never re-send a row that already carries a txHash.
  if (payout.txHash) return;

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
  // M4: heartbeat updatedAt on the BROADCASTING row while we are actively
  // working (waiting on the lock + sending), so resumeInFlightPayouts never
  // mistakes a slow-but-live send on this pod for an abandoned one and
  // re-broadcasts it. Guarded on (BROADCASTING, txHash null) so we never touch
  // a row that has since progressed. Cancelled in `finally`.
  const heartbeat = setInterval(() => {
    void prisma.payout
      .updateMany({
        where: { id: payoutId, status: "BROADCASTING", txHash: null },
        data: { failureReason: null },
      })
      .catch(() => {
        // Best-effort liveness ping; a missed beat just shortens the safety
        // margin, it doesn't corrupt state.
      });
  }, BROADCASTING_HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();
  try {
    const account = treasuryAccount();
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(config.CELO_RPC_URL),
    });
    const winner = payout.user.walletAddress as Address;
    const value = parseUnits(payout.amount, token.decimals);
    // Serialize every treasury send through the shared mutex + cross-pod Redis
    // lock, and drive the nonce explicitly so concurrent sends from the single
    // treasury account can't collide.
    txHash = await withTreasuryLock(
      account.address,
      () =>
        sendTreasuryTransaction(walletClient, account.address, () => {
          if (token.isNative) {
            // Native CELO: gas paid in CELO, no feeCurrency override.
            return { to: winner, value };
          }
          // ERC-20 prize transfer: omit feeCurrency so gas is paid in CELO.
          // Paying gas in the same token can drain a "just enough" USDT/USDC
          // balance before transfer(), causing an exceeds-balance revert.
          const data = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [winner, value],
          });
          return { to: token.address!, data };
        }),
      log,
    );
  } catch (e) {
    clearInterval(heartbeat);
    const reason = e instanceof Error ? e.message : String(e);
    // C1: only mark FAILED when we are CERTAIN the tx never entered the
    // mempool. A network timeout / dropped RPC connection can throw AFTER the
    // node accepted the tx — marking FAILED with a null txHash would let
    // retryFailedPayout (whose chain re-check only runs `if (payout.txHash)`)
    // skip the on-chain check and re-broadcast, double-paying when the original
    // mines. For ambiguous outcomes leave the row in BROADCASTING (untouched,
    // txHash still null) so resumeInFlightPayouts re-checks it on the treasury
    // account and recovers without re-sending.
    if (classifySendError(e) === "AMBIGUOUS") {
      // Bump updatedAt so the resume staleness window restarts from this point
      // (the send genuinely got this far). The row stays BROADCASTING.
      await prisma.payout.updateMany({
        where: { id: payoutId, status: "BROADCASTING", txHash: null },
        data: { failureReason: `ambiguous send (left in-flight): ${reason}` },
      });
      log.error(
        { payoutId, quizId: payout.quizId, rank: payout.rank, reason },
        "payout send outcome AMBIGUOUS (timeout/network); leaving BROADCASTING for on-chain re-check, NOT marking FAILED to avoid double pay",
      );
      return;
    }
    // Definitive pre-broadcast rejection (insufficient funds, bad params,
    // classified nonce error, revert during estimation): the tx never
    // broadcast, so it is safe to mark FAILED and let the admin retry.
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
  // Send succeeded: stop the liveness heartbeat before recording the txHash.
  clearInterval(heartbeat);

  // Persist the txHash atomically with the BROADCAST transition. Guarding on
  // the BROADCASTING status we claimed above means only this winner writes it.
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

export async function runQuizPayoutBroadcast(quizId: string): Promise<void> {
  const candidates = await prisma.payout.findMany({
    where: { quizId, status: "APPROVED" },
    include: { user: true },
    orderBy: { rank: "asc" },
  });
  if (candidates.length === 0) return;

  const claimedIds: string[] = [];
  for (const candidate of candidates) {
    const claimed = await prisma.payout.updateMany({
      where: { id: candidate.id, status: "APPROVED" },
      data: { status: "BROADCASTING", failureReason: null },
    });
    if (claimed.count === 1) claimedIds.push(candidate.id);
  }
  if (claimedIds.length === 0) return;

  const claimed = await prisma.payout.findMany({
    where: {
      id: { in: claimedIds },
      status: "BROADCASTING",
      txHash: null,
    },
    include: { user: true },
    orderBy: { rank: "asc" },
  });
  if (claimed.length === 0) return;

  const sendable: Array<{
    payout: (typeof claimed)[number];
    tx: { to: Address; value?: bigint; data?: Hex };
  }> = [];

  for (const payout of claimed) {
    if (!payout.user.walletAddress || !isAddress(payout.user.walletAddress)) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: "Winner has no valid walletAddress",
        },
      });
      broadcast(payout.quizId, {
        type: "payout_failed",
        payoutId: payout.id,
        rank: payout.rank,
        userId: payout.userId,
        amount: payout.amount,
        reason: "invalid_wallet",
      });
      continue;
    }

    const token = getPayoutTokenByAddress(payout.tokenAddress);
    if (!token) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: `Unknown payout token address: ${payout.tokenAddress}`,
        },
      });
      broadcast(payout.quizId, {
        type: "payout_failed",
        payoutId: payout.id,
        rank: payout.rank,
        userId: payout.userId,
        amount: payout.amount,
        reason: "unknown_token",
      });
      continue;
    }

    try {
      const winner = payout.user.walletAddress;
      const value = parseUnits(payout.amount, token.decimals);
      const tx = token.isNative
        ? { to: winner, value }
        : {
            to: token.address!,
            data: encodeFunctionData({
              abi: ERC20_TRANSFER_ABI,
              functionName: "transfer",
              args: [winner, value],
            }),
          };
      sendable.push({ payout, tx });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: reason,
        },
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

  if (sendable.length === 0) return;

  const account = treasuryAccount();
  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(config.CELO_RPC_URL),
  });
  const windowSize =
    config.PAYOUT_BURST_WINDOW_SIZE > 0
      ? config.PAYOUT_BURST_WINDOW_SIZE
      : sendable.length;
  const concurrency = Math.min(config.PAYOUT_BURST_CONCURRENCY, windowSize);

  await withTreasuryLock(
    account.address,
    async () => {
      resetNonce(account.address);
      try {
        const firstNonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        log.info(
          {
            quizId,
            count: sendable.length,
            firstNonce,
            windowSize,
            concurrency,
          },
          "broadcasting quiz payouts in nonce-managed burst",
        );

        for (let windowStart = 0; windowStart < sendable.length; windowStart += windowSize) {
          const windowEnd = Math.min(windowStart + windowSize, sendable.length);
          const windowNext = { value: windowStart };

          async function windowWorker(): Promise<void> {
            while (windowNext.value < windowEnd) {
              const index = windowNext.value++;
              const item = sendable[index]!;
              const nonce = firstNonce + index;
              try {
                const hash = await walletClient.sendTransaction({
                  ...item.tx,
                  nonce,
                } as Parameters<typeof walletClient.sendTransaction>[0]);
                await prisma.payout.updateMany({
                  where: {
                    id: item.payout.id,
                    status: "BROADCASTING",
                    txHash: null,
                  },
                  data: { status: "BROADCAST", txHash: hash },
                });
                broadcast(item.payout.quizId, {
                  type: "payout_approved",
                  payoutId: item.payout.id,
                  rank: item.payout.rank,
                  userId: item.payout.userId,
                  amount: item.payout.amount,
                  txHash: hash,
                });
                void confirmPayoutInBackground(item.payout.id);
              } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                if (classifySendError(e) === "AMBIGUOUS") {
                  await prisma.payout.updateMany({
                    where: {
                      id: item.payout.id,
                      status: "BROADCASTING",
                      txHash: null,
                    },
                    data: {
                      failureReason: `ambiguous send (left in-flight): ${reason}`,
                    },
                  });
                  log.error(
                    {
                      payoutId: item.payout.id,
                      quizId,
                      rank: item.payout.rank,
                      nonce,
                      reason,
                    },
                    "bulk payout send outcome AMBIGUOUS; leaving row BROADCASTING",
                  );
                  continue;
                }
                await prisma.payout.updateMany({
                  where: {
                    id: item.payout.id,
                    status: "BROADCASTING",
                    txHash: null,
                  },
                  data: { status: "FAILED", failureReason: reason },
                });
                broadcast(item.payout.quizId, {
                  type: "payout_failed",
                  payoutId: item.payout.id,
                  rank: item.payout.rank,
                  userId: item.payout.userId,
                  amount: item.payout.amount,
                  reason,
                });
              }
            }
          }

          await Promise.all(
            Array.from(
              { length: Math.min(concurrency, windowEnd - windowStart) },
              () => windowWorker(),
            ),
          );

          if (config.PAYOUT_BURST_WINDOW_WAIT_FOR_MINED) {
            await waitForSenderNonce(account.address, firstNonce + windowEnd);
            log.info(
              {
                quizId,
                windowStart: windowStart + 1,
                windowEnd,
                targetNonce: firstNonce + windowEnd,
              },
              "quiz payout window mined",
            );
          }
        }
      } finally {
        resetNonce(account.address);
      }
    },
    log,
  );
}

// Number of send attempts. We only ever retry on a classified nonce error
// (the only failure that PROVES the tx never broadcast and that a fresh nonce
// can fix). Ambiguous failures break out immediately — re-sending could
// double-pay, and the original may have already consumed the nonce.
const SEND_MAX_ATTEMPTS = 3;
const SEND_RETRY_BACKOFF_MS = 250;

// Sign + send a single treasury transaction with an explicit, locally-managed
// nonce. MUST be called inside withTreasuryLock so the nonce cache is mutated
// under the mutex.
//
// Nonce-safety rules (H2):
//   - The per-pod nonce cache is load-bearing, not just an optimization: under
//     serialized-but-rapid sends a fresh `pending` read can hand back the same
//     nonce twice (the prior tx isn't reflected yet), so the happy path keeps
//     the cache (getNextNonce uses it; commitNonce increments it locally).
//   - On a classified nonce error the tx provably never broadcast: drop the
//     cache, re-fetch the pending nonce FRESH from chain, and retry (bounded,
//     short backoff). This is the "don't trust a possibly-stale cache" path —
//     e.g. after a prior ambiguous failure left the cache pointing at a nonce a
//     landed tx already consumed, the first attempt's nonce-too-low self-heals.
//   - On an AMBIGUOUS error the tx MAY have entered the mempool and consumed
//     the nonce. Do NOT reset the nonce (resetting would let the next send
//     reuse/skip it and cascade subsequent payouts to FAILED) and do NOT retry.
//     Re-throw so the caller leaves the row BROADCASTING for re-check.
//   - On a definitive PRE_BROADCAST rejection (insufficient funds, bad params,
//     revert) the nonce was not consumed: reset so the next caller re-syncs,
//     then re-throw.
export async function sendTreasuryTransaction(
  walletClient: ReturnType<typeof createWalletClient>,
  treasuryAddr: Address,
  buildTx: () => { to: Address; value?: bigint; data?: Hex },
): Promise<Hex> {
  const fetchPending = () =>
    publicClient.getTransactionCount({
      address: treasuryAddr,
      blockTag: "pending",
    });

  for (let attempt = 0; attempt < SEND_MAX_ATTEMPTS; attempt++) {
    // Attempt 0 trusts the cache (correctness depends on it under rapid sends).
    // Retries are only reached after a classified nonce error, which reset the
    // cache below, so getNextNonce there re-reads a fresh pending nonce.
    const nonce = await getNextNonce(treasuryAddr, fetchPending);
    try {
      const tx = buildTx();
      const hash = await walletClient.sendTransaction({
        ...tx,
        nonce,
      } as Parameters<typeof walletClient.sendTransaction>[0]);
      commitNonce(treasuryAddr, nonce);
      return hash;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const klass = classifySendError(e);

      // Classified nonce error: the tx never broadcast and a fresh nonce can
      // fix it. Drop the cache so the next getNextNonce re-reads from chain,
      // then retry (bounded) after a short backoff.
      if (isNonceError(message) && attempt < SEND_MAX_ATTEMPTS - 1) {
        resetNonce(treasuryAddr);
        await new Promise((r) => setTimeout(r, SEND_RETRY_BACKOFF_MS));
        continue;
      }

      if (klass === "AMBIGUOUS") {
        // Outcome unknown — the tx may have consumed this nonce. Leave the
        // cache as-is (do NOT reset) and surface the error; the caller keeps
        // the payout BROADCASTING for an on-chain re-check.
        throw e;
      }

      // PRE_BROADCAST: the node rejected the tx before it entered the mempool,
      // so the nonce was not consumed. Reset so the next send re-syncs.
      resetNonce(treasuryAddr);
      throw e;
    }
  }
  // Exhausted nonce retries without a definitive send. Treat as pre-broadcast
  // (we only loop on nonce errors, which never broadcast) and re-sync.
  resetNonce(treasuryAddr);
  throw new Error("treasury send failed after nonce retries");
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

  // Before re-sending a FAILED payout that still has a txHash, re-check the
  // chain. A confirmation-timeout can mark a payout FAILED while its tx is
  // still pending and later mines successfully — re-sending would double-pay.
  if (payout.txHash) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: payout.txHash as Hex,
      });
      if (receipt.status === "success") {
        const settled = await prisma.payout.updateMany({
          where: { id: payoutId, status: "FAILED" },
          data: { status: "CONFIRMED", confirmedAt: new Date(), failureReason: null },
        });
        if (settled.count === 1) {
          broadcast(payout.quizId, {
            type: "payout_confirmed",
            payoutId: payout.id,
            rank: payout.rank,
            userId: payout.userId,
            amount: payout.amount,
            txHash: payout.txHash,
          });
          try {
            await awardBadge(payout.userId, "first_usdt");
          } catch {
            // Idempotent; ignore.
          }
        }
        return { status: "CONFIRMED" };
      }
      // Receipt exists and reverted: safe to clear and re-send below.
    } catch {
      // No receipt yet (tx still pending). Refuse to re-send and let the
      // background confirmation / resume path settle it to avoid double pay.
      return {
        status: payout.status,
        error: "Existing transaction is still pending on-chain; not re-sending",
      };
    }
  }

  // Atomically transition FAILED -> APPROVED so an admin double-click can't
  // enqueue two broadcasts for the same row.
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "FAILED" },
    data: {
      status: "APPROVED",
      approvedById: adminUserId,
      failureReason: null,
      txHash: null,
      confirmedAt: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await prisma.payout.findUnique({ where: { id: payoutId } });
    return {
      status: current?.status ?? "error",
      error: `Payout is ${current?.status ?? "unknown"}`,
    };
  }
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

  // Atomically transition PENDING -> APPROVED so concurrent admin clicks can't
  // both proceed to enqueue a broadcast for the same payout.
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "PENDING" },
    data: { status: "APPROVED", approvedById: adminUserId },
  });
  if (claimed.count !== 1) {
    const current = await prisma.payout.findUnique({ where: { id: payoutId } });
    return {
      status: current?.status ?? "error",
      error: `Payout is ${current?.status ?? "unknown"}`,
    };
  }
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
      timeout: config.PAYOUT_BURST_RECEIPT_TIMEOUT_MS,
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
    // A timeout (no receipt within the window) does NOT mean the tx failed —
    // it may still be pending and mine later. Flipping it to FAILED here is
    // what lets a retry re-send and double-pay. Leave it as BROADCAST so
    // resumeInFlightPayouts re-checks it later. Only a real revert (handled in
    // the success/else branch above) marks FAILED.
    if (e instanceof WaitForTransactionReceiptTimeoutError) {
      log.warn(
        { payoutId, txHash: payout.txHash },
        "payout confirmation timed out; leaving BROADCAST for later re-check",
      );
      return;
    }
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
// previous crash — we had a txHash, we just didn't see the receipt. Also
// recover BROADCASTING rows: those were atomically claimed for signing but the
// process died before the send completed.
// A BROADCASTING row that has been sitting without a txHash for longer than
// this is considered abandoned (the pod that claimed it crashed). We avoid
// resetting fresher rows so we don't disturb a send that another pod is
// actively performing inside withTreasuryLock.
//
// M4: this MUST exceed the absolute worst-case in-flight time of a live send,
// otherwise a slow-but-alive send could be deemed stale and re-broadcast ->
// double pay. Worst case per send ≈ lock max-wait (LOCK_MAX_WAIT_MS, 30s) +
// nonce retries (SEND_MAX_ATTEMPTS × ~RPC timeout 10s + backoff) ≈ ~70s. We set
// 15 min for a generous margin. As a second, primary guard a live sender
// heartbeats updatedAt every BROADCASTING_HEARTBEAT_MS (see runPayoutBroadcast),
// so even a pathologically slow send is never seen as stale while its pod runs.
const BROADCASTING_STALE_MS = 15 * 60_000;

// How often a live sender bumps updatedAt on its BROADCASTING row. Must be well
// under BROADCASTING_STALE_MS so a still-working send always stays "fresh".
const BROADCASTING_HEARTBEAT_MS = 20_000;

export async function resumeInFlightPayouts(): Promise<void> {
  const rows = await prisma.payout.findMany({
    where: { status: { in: ["BROADCASTING", "BROADCAST"] } },
  });
  const staleBefore = Date.now() - BROADCASTING_STALE_MS;
  for (const r of rows) {
    if (r.txHash) {
      // Either a normal BROADCAST awaiting confirmation, or (defensively) a
      // BROADCASTING row that did manage to record a txHash. Re-check the chain.
      void confirmPayoutInBackground(r.id);
      continue;
    }
    // BROADCASTING with no txHash: claimed for signing but no tx recorded.
    // Only recover rows that have been stuck long enough to be sure the
    // claiming worker is gone — otherwise a still-in-flight send on another
    // pod could be re-enqueued and double-pay.
    if (r.updatedAt.getTime() > staleBefore) continue;
    // Guard the transition on the stale updatedAt so we don't clobber a row a
    // live worker just touched. Nothing hit the chain (txHash is null), so
    // resetting to APPROVED and re-broadcasting is safe.
    const reset = await prisma.payout.updateMany({
      where: {
        id: r.id,
        status: "BROADCASTING",
        txHash: null,
        updatedAt: r.updatedAt,
      },
      data: { status: "APPROVED" },
    });
    if (reset.count === 1) {
      log.warn(
        { payoutId: r.id },
        "recovered stale BROADCASTING payout with no txHash; re-broadcasting",
      );
      void requestPayoutBroadcast(r.id);
    }
  }
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
