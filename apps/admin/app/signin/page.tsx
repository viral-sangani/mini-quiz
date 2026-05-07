import { signIn } from "@/lib/auth";
import { AdminIcon } from "@/components/AdminIcon";

const ERROR_LABELS: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  Configuration: "Sign-in is misconfigured. Try again or contact an admin.",
  AccessDenied: "Your account does not have admin access.",
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string };
}) {
  const errorMessage = searchParams.error
    ? ERROR_LABELS[searchParams.error] ?? "Sign-in failed. Please try again."
    : null;

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

          {errorMessage && (
            <div
              className="mt-4 rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--a-wrong-tint)",
                color: "var(--a-wrong)",
              }}
            >
              {errorMessage}
            </div>
          )}

          <form
            className="mt-6 flex flex-col gap-3"
            action={async (formData) => {
              "use server";
              const email = String(formData.get("email") ?? "").trim();
              const password = String(formData.get("password") ?? "");
              if (!email || !password) return;
              await signIn("credentials", { email, password, redirectTo: "/" });
            }}
          >
            <div className="adm-field">
              <label>Work email</label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                defaultValue={searchParams.email}
                placeholder="you@example.com"
                className="adm-input"
              />
            </div>
            <div className="adm-field">
              <label>Password</label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="adm-input"
              />
            </div>
            <button
              type="submit"
              className="adm-btn adm-btn--primary"
              style={{ height: 42, justifyContent: "center", fontSize: 14 }}
            >
              Sign in
              <AdminIcon name="arrow-right" size={14} color="white" />
            </button>
          </form>

          <p
            className="mt-6 text-xs"
            style={{ color: "var(--a-ink-faint)" }}
          >
            Forgot your password? Ask another admin to reset it from the
            Admins page, or run the seed script with new credentials.
          </p>
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
