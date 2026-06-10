import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminUser } from "@mini-quiz/shared";
import { requireAdmin } from "../auth.js";
import { Prisma, prisma } from "../db.js";

const roleSchema = z.object({ role: z.enum(["USER", "ADMIN"]) });
const flagSchema = z.object({ reason: z.string().min(1).max(500) });
const listUsersQuerySchema = z.object({
  q: z.string().optional(),
  flagged: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

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
  app.get<{ Querystring: { q?: string; flagged?: string; page?: string; role?: string; limit?: string } }>(
    "/admin/users",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = listUsersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const q = parsed.data.q?.trim();
      const onlyFlagged = parsed.data.flagged === "true";
      const page = parsed.data.page ?? 1;
      const limit = parsed.data.limit ?? 200;
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
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
      };
      const [total, rows] = await prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: [{ role: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        users: rows.map(serialize),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
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

  // Soft-delete. Sets `deletedAt = now()` so the user disappears from /players,
  // leaderboards, room state, and public profile lookups. Refuses to delete
  // ADMIN role users — revoke admin first via /admins. Foreign keys (Answer,
  // Payout, RoomPlayer) survive intact, so an UPDATE in the DB undoes this.
  app.delete<{ Params: { id: string } }>(
    "/admin/users/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      if (req.params.id === admin.userId) {
        return reply.code(400).send({ error: "Cannot delete yourself" });
      }
      const target = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, role: true, deletedAt: true },
      });
      if (!target) return reply.code(404).send({ error: "User not found" });
      if (target.role === "ADMIN") {
        return reply.code(400).send({
          error: "Cannot delete an admin. Revoke admin access first.",
        });
      }
      if (target.deletedAt) {
        // Idempotent — already deleted.
        return reply.code(204).send();
      }
      await prisma.user.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });
      return reply.code(204).send();
    },
  );
}
