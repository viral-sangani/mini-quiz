import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { config } from "./config.js";
import { prisma } from "./db.js";

// The Next.js admin frontend mints a short-lived HS256 JWT (signed with the
// shared NEXTAUTH_SECRET) and attaches it as `Authorization: Bearer <jwt>`.
//
// As of 2026-05-07 admin auth is email + bcrypt password (NextAuth Credentials
// provider). The api is the single source of truth for password verification
// and admin role. The JWT just carries the verified identity from the most
// recent /admin/auth/login call.
//
// On every admin request we re-check `User.role === ADMIN` from the DB so a
// freshly-revoked admin's old JWT can't keep working.
//
// Expected JWT payload from admin:
//   { sub: <userId>, role: "ADMIN", email: "...", exp: ... }

type AdminPayload = { sub: string; role: "ADMIN" | "USER"; email?: string };

const encoder = new TextEncoder();

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
  if (!payload) {
    reply.code(401).send({ error: "Invalid token" });
    return null;
  }

  // Look up the User row by id (preferred) and re-check role from DB. Email
  // is read for response convenience and audit fields like flaggedById.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user || user.role !== "ADMIN") {
    reply.code(403).send({ error: "Admin access required" });
    return null;
  }
  return { userId: user.id, email: user.email ?? payload.email ?? "" };
}
