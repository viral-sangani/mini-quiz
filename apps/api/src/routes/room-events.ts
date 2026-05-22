import type { FastifyInstance } from "fastify";
import type { RoomEvent } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { subscribe } from "../sse/broker.js";
import { leaderboard } from "../services/room.service.js";

export async function roomEventRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string } }>(
    "/rooms/:code/events",
    async (req, reply) => {
      const quiz = await prisma.quiz.findUnique({
        where: { code: req.params.code.toUpperCase() },
        select: {
          id: true,
          minParticipants: true,
          _count: { select: { players: true } },
        },
      });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(": connected\n\n");
      reply.raw.write("retry: 3000\n\n");

      const leaderboardPayload = await leaderboard(quiz.id);
      const initial: RoomEvent = {
        type: "leaderboard",
        rows: leaderboardPayload.rows,
        totalPlayers: leaderboardPayload.totalPlayers,
        limit: leaderboardPayload.limit,
        partial: leaderboardPayload.partial,
      };
      reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);

      const playerCount = quiz._count.players;
      const lobbyInitial: RoomEvent = {
        type: "lobby_updated",
        quizId: quiz.id,
        playerCount,
        minParticipants: quiz.minParticipants,
        playersNeeded: Math.max(0, quiz.minParticipants - playerCount),
        quorumMet: playerCount >= quiz.minParticipants,
      };
      reply.raw.write(`data: ${JSON.stringify(lobbyInitial)}\n\n`);

      const unsub = subscribe(quiz.id, {
        id: `${quiz.id}-${Date.now()}-${Math.random()}`,
        send: (event) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      req.raw.on("close", () => {
        clearInterval(heartbeat);
        unsub();
      });

      return reply;
    },
  );
}
