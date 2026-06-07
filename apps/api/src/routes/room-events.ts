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

      // Backpressure tracking. reply.raw.write() returns false when the
      // kernel send buffer is full (slow client). We must not keep buffering
      // frames in pod memory unbounded. While backpressured we queue at most
      // one frame per "coalescible" type (leaderboard, answer_distribution)
      // plus all non-coalescible frames, and flush on the socket 'drain'
      // event. If the client stays stuck past a threshold we close it so it
      // reconnects.
      const MAX_BACKPRESSURE_MS = 30_000;
      const MAX_QUEUED_BYTES = 1_000_000;

      let backpressured = false;
      let closed = false;
      let backpressureSince = 0;
      let queuedBytes = 0;
      // Ordered queue of serialized frames pending flush.
      let queue: string[] = [];
      // For coalescible frame types, remember the queue index of the latest
      // frame so a newer one overwrites it instead of appending.
      const coalesceIndex = new Map<string, number>();

      const closeForBackpressure = () => {
        if (closed) return;
        closed = true;
        try {
          reply.raw.end();
        } catch {
          // socket already torn down
        }
      };

      // Returns false if the underlying write reported backpressure.
      const rawWrite = (frame: string): boolean => {
        if (closed) return false;
        try {
          return reply.raw.write(frame);
        } catch {
          closed = true;
          return false;
        }
      };

      const flushQueue = () => {
        backpressured = false;
        const pending = queue;
        queue = [];
        queuedBytes = 0;
        coalesceIndex.clear();
        for (let i = 0; i < pending.length; i += 1) {
          const frame = pending[i];
          if (frame === undefined) continue;
          const ok = rawWrite(frame);
          if (!ok) {
            // Backpressured again mid-flush; requeue the rest and wait for
            // the next drain.
            backpressured = true;
            backpressureSince = Date.now();
            queue = pending.slice(i + 1);
            queuedBytes = queue.reduce((sum, f) => sum + f.length, 0);
            return;
          }
        }
      };

      reply.raw.on("drain", flushQueue);

      const sendFrame = (event: RoomEvent) => {
        if (closed) return;
        const frame = `data: ${JSON.stringify(event)}\n\n`;
        if (!backpressured) {
          const ok = rawWrite(frame);
          if (!ok) {
            backpressured = true;
            backpressureSince = Date.now();
          }
          return;
        }
        // Already backpressured: enqueue. Coalesce the noisy frame types so
        // only the latest one survives; everything else is appended in order.
        const coalesceKey =
          event.type === "leaderboard"
            ? "leaderboard"
            : event.type === "answer_distribution"
              ? `answer_distribution:${event.questionId}`
              : null;
        if (coalesceKey !== null) {
          const existing = coalesceIndex.get(coalesceKey);
          if (existing !== undefined && queue[existing] !== undefined) {
            queuedBytes += frame.length - queue[existing].length;
            queue[existing] = frame;
          } else {
            coalesceIndex.set(coalesceKey, queue.length);
            queue.push(frame);
            queuedBytes += frame.length;
          }
        } else {
          queue.push(frame);
          queuedBytes += frame.length;
        }
        // Give up on hopelessly slow clients.
        if (
          Date.now() - backpressureSince > MAX_BACKPRESSURE_MS ||
          queuedBytes > MAX_QUEUED_BYTES
        ) {
          closeForBackpressure();
        }
      };

      const unsub = subscribe(quiz.id, {
        id: `${quiz.id}-${Date.now()}-${Math.random()}`,
        send: sendFrame,
      });

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        // Heartbeats are tiny; if backpressured we skip writing one (the
        // queue/drain machinery already governs liveness) so we don't grow
        // the buffer further.
        if (backpressured) return;
        const ok = rawWrite(": heartbeat\n\n");
        if (!ok) {
          backpressured = true;
          backpressureSince = Date.now();
        }
      }, 15_000);

      req.raw.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        unsub();
      });

      return reply;
    },
  );
}
