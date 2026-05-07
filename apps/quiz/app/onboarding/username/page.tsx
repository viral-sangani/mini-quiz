"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckUsernameResult } from "@mini-quiz/shared";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MQButton } from "@/components/MQButton";
import { Pill } from "@/components/Pill";
import { useProfile } from "@/lib/profile-context";
import { clearDraft, readDraft, writeDraft } from "@/lib/onboarding-draft";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "result"; result: CheckUsernameResult };

export default function OnboardingUsernamePage() {
  const router = useRouter();
  const { saveProfile, checkUsername } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo(() => readDraft(), []);
  const avatarEmoji = draft.avatarEmoji;
  const avatarColor = draft.avatarColor;

  useEffect(() => {
    if (draft.displayName) setDisplayName(draft.displayName);
    if (draft.username) setUsername(draft.username);
  }, [draft.displayName, draft.username]);

  // Debounced username check.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const v = username.trim().toLowerCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v) {
      setCheck({ status: "idle" });
      return;
    }
    if (!USERNAME_RE.test(v)) {
      setCheck({
        status: "result",
        result: { available: false, reason: "invalid", suggestions: [] },
      });
      return;
    }
    setCheck({ status: "checking" });
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkUsername(v);
        setCheck({ status: "result", result });
      } catch {
        // Don't block submit on a transient check failure; backend re-validates.
        setCheck({ status: "idle" });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, checkUsername]);

  const canSubmit =
    !submitting &&
    displayName.trim().length >= 1 &&
    username.trim().length >= 3 &&
    check.status === "result" &&
    check.result.available;

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!avatarEmoji || !avatarColor) {
      setError("Please pick an avatar first");
      router.push("/onboarding/avatar");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        avatarEmoji,
        avatarColor,
      });
      clearDraft();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />

      <div
        style={{
          padding: "0 16px 12px",
          display: "flex",
          gap: 6,
          justifyContent: "center",
        }}
      >
        <div style={{ width: 36, height: 6, borderRadius: 3, background: "var(--primary)" }} />
        <div style={{ width: 36, height: 6, borderRadius: 3, background: "var(--primary)" }} />
      </div>

      <div style={{ padding: "0 16px 16px", textAlign: "center" }}>
        <div style={{ marginBottom: 8, display: "inline-block" }}>
          <Avatar emoji={avatarEmoji} color={avatarColor} size={88} ring="var(--bg)" />
        </div>
        <h1 className="mq-h2" style={{ marginBottom: 4 }}>Tell us your name</h1>
        <p className="mq-body" style={{ fontSize: 14, maxWidth: 280, margin: "0 auto" }}>
          A display name and a unique handle. You&apos;ll show up like this on leaderboards.
        </p>
      </div>

      {/* Display name */}
      <div style={{ padding: "0 20px 8px" }}>
        <label className="mq-eyebrow" htmlFor="displayName">Display name</label>
        <div
          style={{
            background: "var(--card)",
            border: `2px solid ${displayName.trim() ? "var(--primary)" : "var(--line)"}`,
            borderRadius: 16,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
            boxShadow: displayName.trim()
              ? "0 4px 0 0 var(--primary-shade)"
              : "0 2px 0 0 var(--line)",
          }}
        >
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => {
              const v = e.target.value.slice(0, 32);
              setDisplayName(v);
              writeDraft({ displayName: v });
            }}
            placeholder="Jordan P."
            maxLength={32}
            style={{
              border: 0,
              outline: "none",
              flex: 1,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 18,
              background: "transparent",
              color: "var(--ink)",
            }}
          />
        </div>
      </div>

      {/* Username */}
      <div style={{ padding: "8px 20px 4px" }}>
        <label className="mq-eyebrow" htmlFor="username">Username</label>
        <UsernameField
          username={username}
          check={check}
          onChange={(v) => {
            setUsername(v);
            writeDraft({ username: v });
          }}
        />
        <UsernameHint check={check} />
      </div>

      {/* Suggestions */}
      {check.status === "result" &&
        check.result.suggestions.length > 0 && (
          <div style={{ padding: "8px 20px 8px" }}>
            <div className="mq-eyebrow" style={{ marginBottom: 8 }}>Suggestions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {check.result.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setUsername(s);
                    writeDraft({ username: s });
                  }}
                  style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}
                >
                  <Pill style={{ fontSize: 12, padding: "6px 10px" }}>@{s}</Pill>
                </button>
              ))}
            </div>
          </div>
        )}

      {error && (
        <div
          style={{
            margin: "8px 20px 0",
            padding: "10px 14px",
            borderRadius: 12,
            border: "2px solid var(--wrong)",
            background: "var(--card)",
            color: "var(--wrong-shade)",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ padding: "12px 20px 24px" }}>
        <MQButton block size="lg" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "Saving…" : "Start playing"}
          <Icon name="arrow-right" size={18} color="white" />
        </MQButton>
      </div>
    </>
  );
}

function UsernameField({
  username,
  check,
  onChange,
}: {
  username: string;
  check: CheckState;
  onChange: (v: string) => void;
}) {
  const ok = check.status === "result" && check.result.available;
  const borderColor =
    check.status === "result"
      ? check.result.available
        ? "var(--primary)"
        : "var(--wrong)"
      : "var(--line)";
  const shadow =
    check.status === "result"
      ? check.result.available
        ? "0 4px 0 0 var(--primary-shade)"
        : "0 4px 0 0 var(--wrong-shade)"
      : "0 2px 0 0 var(--line)";

  return (
    <div
      style={{
        background: "var(--card)",
        border: `2px solid ${borderColor}`,
        borderRadius: 16,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
        boxShadow: shadow,
      }}
    >
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, color: "var(--ink-soft)" }}>
        @
      </span>
      <input
        id="username"
        value={username}
        onChange={(e) =>
          onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 20))
        }
        placeholder="jordan_p"
        maxLength={20}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        style={{
          border: 0,
          outline: "none",
          flex: 1,
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 18,
          background: "transparent",
          color: "var(--ink)",
        }}
      />
      {check.status === "checking" && (
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-soft)" }}>checking…</span>
      )}
      {ok && (
        <span
          style={{
            width: 24,
            height: 24,
            background: "var(--primary)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={14} color="white" strokeWidth={4} />
        </span>
      )}
    </div>
  );
}

function UsernameHint({ check }: { check: CheckState }) {
  if (check.status !== "result") {
    return (
      <p style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "var(--ink-faint)" }}>
        3–20 letters, numbers, or underscores.
      </p>
    );
  }
  const r = check.result;
  if (r.available) {
    return (
      <p style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "var(--primary-shade)", display: "flex", alignItems: "center", gap: 4 }}>
        <Icon name="check" size={12} color="var(--primary-shade)" /> Available
      </p>
    );
  }
  const label =
    r.reason === "taken"
      ? "Already taken"
      : r.reason === "blocked"
        ? "That handle isn't allowed"
        : "Use 3–20 letters, numbers, or underscores";
  return (
    <p style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "var(--wrong-shade)", display: "flex", alignItems: "center", gap: 4 }}>
      <Icon name="x" size={12} color="var(--wrong-shade)" /> {label}
    </p>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
      }}
    >
      <Link
        href="/onboarding/avatar"
        aria-label="Back"
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: "var(--card)",
          border: "2px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 0 0 var(--line)",
        }}
      >
        <Icon name="arrow-left" size={18} color="var(--ink)" />
      </Link>
      <div className="mq-h3" style={{ flex: 1, textAlign: "center" }}>
        Your name
      </div>
      <div style={{ width: 36 }} />
    </div>
  );
}
