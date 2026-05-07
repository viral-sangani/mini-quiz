import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  checkUsername,
  getOrCreatePlayerByWallet,
  getPublicProfile,
  isProfileError,
  updateMyProfile,
} from "../services/profile.service.js";

const checkSchema = z.object({
  value: z.string().min(1).max(40),
});

const meQuerySchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const updateSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  displayName: z.string().min(1).max(32).optional(),
  username: z.string().min(3).max(20).optional(),
  avatarEmoji: z.string().min(1).max(8).optional(),
  avatarColor: z.string().min(1).max(20).optional(),
});

export async function publicProfileRoutes(app: FastifyInstance) {
  // GET /users/check-username?value=jordan_p
  app.get("/users/check-username", async (req, reply) => {
    const parsed = checkSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return checkUsername(parsed.data.value);
  });

  // GET /users/me?walletAddress=0x...  (player identity = wallet for v1)
  app.get("/users/me", async (req, reply) => {
    const parsed = meQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    return getOrCreatePlayerByWallet(parsed.data.walletAddress);
  });

  // PATCH /users/me  (body has walletAddress + any subset of fields)
  app.patch("/users/me", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await updateMyProfile(parsed.data);
    if (isProfileError(result)) {
      const status =
        result.code === "USERNAME_TAKEN"
          ? 409
          : result.code === "USERNAME_INVALID" || result.code === "USERNAME_BLOCKED"
            ? 422
            : 400;
      return reply.code(status).send(result);
    }
    return { profile: result };
  });

  // GET /users/:userId/profile — public view of someone else's profile
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/profile",
    async (req, reply) => {
      const profile = await getPublicProfile(req.params.userId);
      if (!profile) return reply.code(404).send({ error: "User not found" });
      return { profile };
    },
  );
}
