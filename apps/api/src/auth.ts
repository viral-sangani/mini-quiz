import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { config } from "./config.js";
import { prisma } from "./db.js";

// The Next.js frontend exchanges its NextAuth v5 session (a JWE, A256CBC-HS512,
// key-derived via HKDF-SHA256 from NEXTAUTH_SECRET) for a short-lived HS256
// bearer token minted at GET /api/auth/token, signed with the SAME
// NEXTAUTH_SECRET raw bytes. The frontend attaches that HS256 token as
// `Authorization: Bearer <jwt>` when calling the backend.
//
// We intentionally do NOT try to decrypt the NextAuth JWE here: the frontend is
// the only place that owns the session, and the cookie isn't cross-origin anyway.
//
// Expected payload:
//   { sub: userId (User.id), role: "ADMIN" | "USER", email?: string, exp: ... }

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
): Promise<{ userId: string; email: string | null } | null> {
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
  // Re-check role against DB in case the user was demoted after the JWT was
  // issued. JWTs can outlive role changes; DB is source of truth.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "ADMIN") {
    reply.code(403).send({ error: "Admin access required" });
    return null;
  }
  return { userId: user.id, email: user.email };
}
