import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../auth.js";
import { getAdminStats } from "../services/admin-stats.service.js";

export async function adminStatsRoutes(app: FastifyInstance) {
  app.get("/admin/stats", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const stats = await getAdminStats();
    return stats;
  });
}
