import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminUser } from "@mini-quiz/shared";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";

const roleSchema = z.object({ role: z.enum(["USER", "ADMIN"]) });
const flagSchema = z.object({ reason: z.string().min(1).max(500) });

type UserRow = Awaited<ReturnType<typeof prisma.user.findMany>>[number];

function serialize(u: UserRow): AdminUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    walletAddress: u.walletAddress,
    displayName: u.displayName,
    username: u.username,
    avatarEmoji: u.avatarEmoji,
    avatarColor: u.avatarColor,
    role: u.role,
    flagged: u.flagged,
    flagReason: u.flagReason,
    flaggedAt: u.flaggedAt?.toISOString() ?? null,
    totalXp: u.totalXp,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function adminUserRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; flagged?: string } }>(
    "/admin/users",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const q = req.query.q?.trim();
      const onlyFlagged = req.query.flagged === "true";
      const rows = await prisma.user.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { email: { contains: q, mode: "insensitive" } },
                  { displayName: { contains: q, mode: "insensitive" } },
                  { username: { contains: q.toLowerCase() } },
                  { walletAddress: { contains: q.toLowerCase() } },
                ],
              }
            : {}),
          ...(onlyFlagged ? { flagged: true } : {}),
        },
        orderBy: [{ role: "desc" }, { createdAt: "desc" }],
        take: 200,
      });
      return { users: rows.map(serialize) };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/users/:id/role",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { role: parsed.data.role },
      });
      return { user: serialize(updated) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/flag",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = flagSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          flagged: true,
          flagReason: parsed.data.reason,
          flaggedAt: new Date(),
          flaggedById: admin.userId,
        },
      });
      return { user: serialize(updated) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/unflag",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          flagged: false,
          flagReason: null,
          flaggedAt: null,
          flaggedById: null,
        },
      });
      return { user: serialize(updated) };
    },
  );
}
