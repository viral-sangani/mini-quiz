import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mintBackendToken } from "@/lib/backend-token";

// The Next.js frontend calls this to obtain a short-lived HS256 JWT that the
// Fastify backend can verify with the shared NEXTAUTH_SECRET. The backend
// doesn't understand NextAuth's session cookie (which is an encrypted JWE),
// so we exchange it here.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const token = await mintBackendToken({
    sub: session.user.id,
    role: session.user.role,
    email: session.user.email,
  });
  return NextResponse.json({ token });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
