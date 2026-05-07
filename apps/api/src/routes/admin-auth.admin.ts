import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import {
  changeOwnPassword,
  createAdmin,
  listAdmins,
  loginAdmin,
  resetAdminPassword,
  revokeAdmin,
} from "../services/admin-auth.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(1),
});

export async function adminAuthRoutes(app: FastifyInstance) {
  // ─── PUBLIC: login ──────────────────────────────────────────────────────
  // Called server-side by NextAuth's authorize() in apps/admin/lib/auth.ts.
  // Returns minimal claims; the admin app stamps them into a JWT.
  app.post("/admin/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input" });
    }
    const result = await loginAdmin(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    return { userId: result.userId, email: result.email, role: result.role };
  });

  // ─── ADMIN-ONLY: self-service ───────────────────────────────────────────
  app.post("/admin/auth/change-password", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const result = await changeOwnPassword(
      admin.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    if (!result.ok) return reply.code(400).send({ error: result.reason });
    return reply.code(204).send();
  });

  app.get("/admin/auth/me", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return { userId: admin.userId, email: admin.email, role: "ADMIN" };
  });

  // ─── ADMIN-ONLY: admin management ───────────────────────────────────────
  app.get("/admin/auth/admins", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return { admins: await listAdmins() };
  });

  app.post("/admin/auth/admins", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const result = await createAdmin(parsed.data.email, parsed.data.password, admin.userId);
    if (!result.ok) return reply.code(400).send({ error: result.reason });
    return reply.code(201).send({ userId: result.userId });
  });

  app.delete<{ Params: { userId: string } }>("/admin/auth/admins/:userId", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const result = await revokeAdmin(req.params.userId, admin.userId);
    if (!result.ok) return reply.code(400).send({ error: result.reason });
    return reply.code(204).send();
  });

  app.post<{ Params: { userId: string } }>(
    "/admin/auth/admins/:userId/reset-password",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

      const result = await resetAdminPassword(req.params.userId, parsed.data.newPassword);
      if (!result.ok) return reply.code(400).send({ error: result.reason });
      return reply.code(204).send();
    },
  );
}
