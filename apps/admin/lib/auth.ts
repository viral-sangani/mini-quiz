import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

// NextAuth v5 with JWT-only sessions and an ADMIN_EMAILS allowlist —
// no Prisma adapter, no DB rows. Anyone whose verified email is in
// ADMIN_EMAILS gets `role: "ADMIN"` baked into the JWT. The Fastify api
// re-checks the same allowlist server-side.
//
// Trade-off: demoting an admin = remove from ADMIN_EMAILS env var on the
// api Pod (sealed-secret rotation, ~1 min). No per-user role storage.
//
// See docs/decisions.md #13.

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  }),
];

// Nodemailer requires a real SMTP URL — only enable it when configured.
if (process.env.EMAIL_SERVER) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM ?? "no-reply@example.com",
    }),
  );
}

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  // Required for non-Vercel deployments / local dev — without this NextAuth
  // rejects POSTs from the local Host header as untrusted, producing
  // MissingCSRF on every signIn() server action.
  trustHost: true,
  providers,
  callbacks: {
    async signIn({ user }) {
      // Hard-block sign-in if email is not on the allowlist. NextAuth has
      // already verified the address (OAuth flow or magic-link), so by the
      // time we reach this callback the email is trusted.
      return isAdminEmail(user?.email);
    },
    async jwt({ token, user }) {
      // On first sign-in (user present), set sub to the email and stamp
      // role from the allowlist. After that the JWT is self-contained.
      // We refresh role on every decode so demotions take effect on next
      // request rather than waiting for the JWT to expire.
      if (user?.email) {
        token.sub = user.email.toLowerCase();
        token.email = user.email.toLowerCase();
        token.role = isAdminEmail(user.email) ? "ADMIN" : "USER";
      } else if (typeof token.email === "string") {
        token.role = isAdminEmail(token.email) ? "ADMIN" : "USER";
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
