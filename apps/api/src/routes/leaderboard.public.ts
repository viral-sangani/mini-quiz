import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { globalLeaderboard } from "../services/leaderboard.service.js";

const querySchema = z.object({
  period: z.enum(["today", "week", "all"]).default("today"),
  // Optional viewer (player wallet's User.id) so we can return their rank when
  // they're not in the top 50.
  viewerUserId: z.string().min(1).optional(),
});

export async function publicLeaderboardRoutes(app: FastifyInstance) {
  app.get("/leaderboard", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return globalLeaderboard(parsed.data.period, parsed.data.viewerUserId);
  });
}
