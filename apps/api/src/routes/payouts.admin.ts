import type { FastifyInstance } from "fastify";
import type { PayoutStatus } from "@prisma/client";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { approvePayout } from "../services/payout.service.js";

export async function adminPayoutRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; quizId?: string } }>(
    "/admin/payouts",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const status = req.query.status as PayoutStatus | undefined;
      const rows = await prisma.payout.findMany({
        where: {
          status: status ?? undefined,
          quizId: req.query.quizId ?? undefined,
        },
        include: {
          user: { select: { displayName: true, walletAddress: true } },
          quiz: { select: { title: true, code: true } },
        },
        orderBy: [{ createdAt: "desc" }, { rank: "asc" }],
      });
      return {
        payouts: rows.map((p) => ({
          id: p.id,
          quizId: p.quizId,
          quizTitle: p.quiz.title,
          quizCode: p.quiz.code,
          rank: p.rank,
          amount: p.amount,
          tokenAddress: p.tokenAddress,
          status: p.status,
          txHash: p.txHash,
          confirmedAt: p.confirmedAt?.toISOString() ?? null,
          userId: p.userId,
          displayName: p.user.displayName ?? "Player",
          walletAddress: p.user.walletAddress,
          approvedById: p.approvedById,
          failureReason: p.failureReason,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/payouts/:id/approve",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const result = await approvePayout(req.params.id, admin.userId);
      if (result.error) return reply.code(400).send(result);
      return result;
    },
  );

  // Single-payout detail for /payouts/[id]. Joins user + quiz + lifetime stats.
  app.get<{ Params: { id: string } }>(
    "/admin/payouts/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const p = await prisma.payout.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              walletAddress: true,
              avatarEmoji: true,
              avatarColor: true,
              totalXp: true,
              createdAt: true,
            },
          },
          quiz: { select: { id: true, code: true, title: true, prizeAmounts: true } },
        },
      });
      if (!p) return reply.code(404).send({ error: "Payout not found" });

      const [userPayouts, gamesPlayed] = await Promise.all([
        prisma.payout.findMany({
          where: { userId: p.userId, status: "CONFIRMED" },
          select: { amount: true },
        }),
        prisma.roomPlayer.count({ where: { userId: p.userId } }),
      ]);
      const lifetimeUsdt = userPayouts.reduce(
        (a, b) => a + Number(b.amount || 0),
        0,
      );

      return {
        payout: {
          id: p.id,
          quizId: p.quizId,
          quizTitle: p.quiz.title,
          quizCode: p.quiz.code,
          prizeAmounts: p.quiz.prizeAmounts,
          rank: p.rank,
          amount: p.amount,
          tokenAddress: p.tokenAddress,
          status: p.status,
          txHash: p.txHash,
          confirmedAt: p.confirmedAt?.toISOString() ?? null,
          failureReason: p.failureReason,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          user: {
            id: p.user.id,
            displayName: p.user.displayName,
            username: p.user.username,
            walletAddress: p.user.walletAddress,
            avatarEmoji: p.user.avatarEmoji,
            avatarColor: p.user.avatarColor,
            totalXp: p.user.totalXp,
            createdAt: p.user.createdAt.toISOString(),
            lifetimeUsdt: Number(lifetimeUsdt.toFixed(6)).toString(),
            gamesPlayed,
          },
        },
      };
    },
  );
}
