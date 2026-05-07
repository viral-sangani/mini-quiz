// Mints a short-lived HS256 JWT that the Fastify backend can verify with the
// shared NEXTAUTH_SECRET. Called server-side from /api/auth/token.

import { SignJWT } from "jose";

const encoder = new TextEncoder();

export async function mintBackendToken(payload: {
  sub: string;
  role: "USER" | "ADMIN";
  email?: string | null;
}): Promise<string> {
  const secret = encoder.encode(process.env.NEXTAUTH_SECRET ?? "");
  return await new SignJWT({
    role: payload.role,
    email: payload.email ?? undefined,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}
