import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Email + password auth via NextAuth Credentials provider. The actual
// password verification happens in the api at POST /admin/auth/login —
// the admin app never sees the passwordHash. NextAuth just relays the
// returned identity into a JWT that the api re-verifies on every call.
//
// See docs/decisions.md (next entry to add) for why we dropped the
// allowlist + Google OAuth flow.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email + Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(rawCredentials) {
      const email =
        typeof rawCredentials?.email === "string"
          ? rawCredentials.email.trim().toLowerCase()
          : "";
      const password =
        typeof rawCredentials?.password === "string" ? rawCredentials.password : "";
      if (!email || !password) return null;

      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          userId: string;
          email: string;
          role: "ADMIN";
        };
        return { id: data.userId, email: data.email, role: data.role };
      } catch {
        return null;
      }
    },
  }),
];

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  // Required for non-Vercel deployments / local dev — without this NextAuth
  // rejects POSTs from the local Host header as untrusted.
  trustHost: true,
  providers,
  callbacks: {
    async jwt({ token, user }) {
      // First sign-in: stamp the api-returned identity into the JWT.
      if (user) {
        const u = user as { id?: string; email?: string; role?: "ADMIN" | "USER" };
        if (u.id) token.sub = u.id;
        if (u.email) token.email = u.email.toLowerCase();
        token.role = u.role ?? "ADMIN";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? "";
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
export const { GET, POST } = nextAuth.handlers;

export async function requireAdminSession() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}
