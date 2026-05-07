import { signIn } from "@/lib/auth";
import { AdminIcon } from "@/components/AdminIcon";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string };
}) {
  return (
    <main
      className="flex min-h-screen"
      style={{ background: "var(--a-bg)", color: "var(--a-ink)" }}
    >
      {/* Left: form */}
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: "var(--a-primary)" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <circle cx="12" cy="11" r="7" fill="white" />
                <circle cx="9" cy="10" r="1.6" fill="var(--a-primary)" />
                <circle cx="15" cy="10" r="1.6" fill="var(--a-primary)" />
                <path
                  d="M9 14q3 3 6 0"
                  stroke="var(--a-primary)"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="font-display text-lg font-black tracking-tight">
                MiniQuiz
              </div>
              <div
                className="text-[10px] font-extrabold tracking-[0.1em]"
                style={{ color: "var(--a-primary)" }}
              >
                ADMIN CONSOLE
              </div>
            </div>
          </div>

          <h1 className="font-display text-3xl font-black tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--a-ink-soft)" }}>
            Sign in with your operations account.
          </p>

          {searchParams.error === "forbidden" && (
            <div
              className="mt-4 rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--a-wrong-tint)",
                color: "var(--a-wrong)",
              }}
            >
              Your account does not have admin access.
            </div>
          )}

          <form
            className="mt-6 flex flex-col gap-3"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="adm-btn"
              style={{ height: 42, justifyContent: "center", fontSize: 14 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6c-.2 1.3-1 2.4-2 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z"
                  fill="#4285F4"
                />
                <path
                  d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.6c-.9.6-2.1 1-3.3 1-2.6 0-4.7-1.7-5.5-4H3v2.5C4.7 19.7 8.1 22 12 22z"
                  fill="#34A853"
                />
                <path
                  d="M6.5 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.5H3C2.4 8.9 2 10.4 2 12s.4 3.1 1 4.5L6.5 14z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 6.4c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 3.4 14.7 2.5 12 2.5 8.1 2.5 4.7 4.7 3 7.5L6.5 10c.8-2.3 2.9-3.6 5.5-3.6z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <div
            className="my-5 flex items-center gap-3 text-xs font-bold tracking-[0.1em]"
            style={{ color: "var(--a-ink-faint)" }}
          >
            <span className="h-px flex-1" style={{ background: "var(--a-line)" }} />
            <span>OR</span>
            <span className="h-px flex-1" style={{ background: "var(--a-line)" }} />
          </div>

          <form
            className="flex flex-col gap-3"
            action={async (formData) => {
              "use server";
              const email = String(formData.get("email") ?? "").trim();
              if (!email) return;
              await signIn("nodemailer", { email, redirectTo: "/" });
            }}
          >
            <div className="adm-field">
              <label>Work email</label>
              <input
                type="email"
                name="email"
                required
                defaultValue={searchParams.email}
                placeholder="you@example.com"
                className="adm-input"
              />
            </div>
            <button
              type="submit"
              className="adm-btn adm-btn--primary"
              style={{ height: 42, justifyContent: "center", fontSize: 14 }}
            >
              Email me a sign-in link
              <AdminIcon name="arrow-right" size={14} color="white" />
            </button>
          </form>
        </div>
      </div>

      {/* Right: brand panel */}
      <div
        className="relative hidden md:flex w-[520px] flex-col justify-end overflow-hidden p-10 text-white"
        style={{
          background:
            "linear-gradient(160deg, var(--a-primary) 0%, #1F8523 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 80,
            right: 120,
            width: 12,
            height: 12,
            borderRadius: 12,
            background: "var(--a-gold)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 180,
            left: 60,
            width: 8,
            height: 8,
            borderRadius: 8,
            background: "var(--a-berry)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 80,
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.3)",
          }}
        />

        {/* Mango bird mark */}
        <div
          style={{
            position: "absolute",
            top: "32%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg width="180" height="180" viewBox="0 0 200 200">
            <ellipse cx="100" cy="165" rx="55" ry="8" fill="rgba(0,0,0,0.15)" />
            <ellipse cx="100" cy="110" rx="58" ry="55" fill="#7BC74D" />
            <ellipse cx="100" cy="125" rx="36" ry="30" fill="#FFE9B0" />
            <circle cx="82" cy="100" r="10" fill="white" />
            <circle cx="118" cy="100" r="10" fill="white" />
            <circle cx="84" cy="103" r="5" fill="#1A2E1A" />
            <circle cx="120" cy="103" r="5" fill="#1A2E1A" />
            <circle cx="86" cy="101" r="1.6" fill="white" />
            <circle cx="122" cy="101" r="1.6" fill="white" />
            <path d="M93 122 L100 130 L107 122 L100 116 Z" fill="#FF9F1C" />
          </svg>
        </div>

        <div className="relative">
          <div
            className="font-display"
            style={{
              fontWeight: 900,
              fontSize: 28,
              lineHeight: 1.2,
              letterSpacing: "-0.015em",
              marginBottom: 12,
            }}
          >
            Run the games.
            <br />
            Watch the wins.
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500, lineHeight: 1.5 }}>
            Schedule, monitor, and reconcile every game from one console. Payouts run themselves — you just keep an eye on what matters.
          </div>
        </div>
      </div>
    </main>
  );
}
