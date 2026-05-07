import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { config } from "./config.js";
import { prisma } from "./db.js";

// The Next.js admin frontend mints a short-lived HS256 JWT (signed with the
// shared NEXTAUTH_SECRET) and attaches it as `Authorization: Bearer <jwt>`.
//
// As of 2026-05-07 the admin app no longer uses the Prisma adapter — it runs
// on Vercel without DB access. The api is the only thing that knows about
// User rows. Admin gating is done via an ADMIN_EMAILS allowlist on both
// sides (env var on the admin app for sign-in gating, env var here for
// route-level enforcement). See docs/decisions.md #13.
//
// Expected JWT payload from admin:
//   { sub: <lowercased-email>, role: "ADMIN", email: "...", exp: ... }
//
// `sub` is the lowercased email — NOT a User.id. We resolve email→User.id
// here (upserting by email if first time) so downstream foreign keys
// (Quiz.createdById, Payout.approvedById, User.flaggedById) still work.

type AdminPayload = { sub: string; role: "ADMIN" | "USER"; email?: string };

const encoder = new TextEncoder();

// config.ADMIN_EMAILS is already parsed by Zod into a lowercased string[].
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return config.ADMIN_EMAILS.includes(email.toLowerCase());
}

async function verifyToken(token: string): Promise<AdminPayload | null> {
  try {
    const secret = encoder.encode(config.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const role = (payload as { role?: unknown }).role;
    if (role !== "ADMIN" && role !== "USER") return null;
    const email =
      typeof (payload as { email?: unknown }).email === "string"
        ? (payload as { email: string }).email
        : undefined;
    return { sub: payload.sub, role, email };
  } catch {
    return null;
  }
}

// Resolve an email to a User row, creating one if needed. The admin app
// doesn't write User rows any more, so this is the only place a User exists
// for an admin who has never played a quiz themselves. Idempotent.
async function getOrCreateAdminUser(
  email: string,
): Promise<{ id: string; email: string }> {
  const lower = email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: lower },
    update: {},
    create: { email: lower, role: "ADMIN" },
    select: { id: true, email: true },
  });
  return { id: user.id, email: user.email ?? lower };
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string; email: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing Authorization bearer token" });
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = await verifyToken(token);
  if (!payload?.email) {
    reply.code(401).send({ error: "Invalid token" });
    return null;
  }
  if (!isAdminEmail(payload.email)) {
    reply.code(403).send({ error: "Admin access required" });
    return null;
  }
  const user = await getOrCreateAdminUser(payload.email);
  return { userId: user.id, email: user.email };
}
