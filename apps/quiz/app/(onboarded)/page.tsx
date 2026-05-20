"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicQuiz } from "@mini-quiz/shared";
import { lobbyPhase } from "@mini-quiz/shared";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { StatChip } from "@/components/StatChip";
import { api } from "@/lib/api-client";
import { formatTokenAmount } from "@/lib/format";
import { usePlayerCache } from "@/lib/player-cache";
import { useProfile } from "@/lib/profile-context";
import { formatLocal } from "@/lib/time";

export default function HomePage() {
  const { state } = useProfile();
  const [now, setNow] = useState(() => Date.now());

  // Upcoming quizzes — backed by the cache so tab-switches return instantly.
  // We still want fast updates while on the home tab, so a 10s `refetch`
  // interval lives alongside the 1s clock tick.
  const { data, refetch } = usePlayerCache<{ quizzes: PublicQuiz[] }>(
    "upcoming-quizzes",
    () => api.get<{ quizzes: PublicQuiz[] }>("/quizzes/upcoming"),
    { staleAfterMs: 10_000 },
  );
  const quizzes = data?.quizzes ?? null;

  useEffect(() => {
    const fetchId = setInterval(() => void refetch(), 10_000);
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(fetchId);
      clearInterval(tickId);
    };
  }, [refetch]);

  // Pick the most actionable quiz to feature in the "Live now" hero:
  // Live > lobby-open > starting > pre-lobby (next today). Falls back to first
  // upcoming if no live/lobby quiz exists.
  const featured = useMemo(() => featuredQuiz(quizzes ?? [], now), [quizzes, now]);
  const others = useMemo(
    () => (quizzes ?? []).filter((q) => q.id !== featured?.id),
    [quizzes, featured],
  );

  const profile = state.status === "ready" ? state.profile : null;
  const totalXp = profile?.totalXp ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Top stats bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar
            emoji={profile?.avatarEmoji}
            color={profile?.avatarColor}
            size={42}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div className="mq-eyebrow" style={{ marginBottom: 2 }}>
              Welcome back
            </div>
            <div className="mq-h3" style={{ fontSize: 16, lineHeight: 1 }}>
              {profile?.displayName ?? "Player"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <StatChip icon="gem" value={totalXp} color="var(--sky)" />
          <StatChip
            icon="trophy"
            value={profile?.wins ?? 0}
            color="var(--gold)"
          />
        </div>
      </div>

      {/* Live now hero */}
      <div style={{ padding: "0 16px 12px" }}>
        {featured ? (
          <FeaturedHero quiz={featured} now={now} />
        ) : quizzes === null ? (
          // First-load placeholder. Tab caching means this only shows on
          // genuine cold open, never on tab-switch back to home.
          <div
            className="mq-card"
            style={{
              height: 150,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <span className="mq-bob" style={{ display: "inline-block" }}>
              <Mango pose="think" size={56} />
            </span>
            <div
              className="mq-body"
              style={{ fontWeight: 800, color: "var(--ink-soft)" }}
            >
              Looking for live games…
            </div>
          </div>
        ) : (
          <NoQuizzesCard />
        )}
      </div>

      {/* Daily + practice shortcuts */}
      <div
        style={{
          padding: "0 16px 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <Link href="/daily" style={{ textDecoration: "none", color: "inherit" }}>
          <MQCard
            style={{
              padding: 14,
              minHeight: 96,
              background: "var(--accent)",
              color: "white",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
              Today
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Daily quiz</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              10 questions · 200s
            </div>
          </MQCard>
        </Link>
        <Link href="/practice" style={{ textDecoration: "none", color: "inherit" }}>
          <MQCard
            style={{
              padding: 14,
              minHeight: 96,
              background: "var(--sky)",
              color: "white",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
              Anytime
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Practice</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              No pressure, no rank
            </div>
          </MQCard>
        </Link>
      </div>

      {others.length > 0 && (
        <>
          <div
            style={{
              padding: "4px 16px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="mq-eyebrow">Up next today</div>
          </div>
          <div
            style={{
              padding: "0 16px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {others.map((q) => (
              <UpNextRow key={q.id} quiz={q} now={now} />
            ))}
          </div>
        </>
      )}

    </div>
  );
}

function featuredQuiz(quizzes: PublicQuiz[], now: number): PublicQuiz | null {
  if (quizzes.length === 0) return null;
  // Score each quiz by how immediate it is.
  const score = (q: PublicQuiz): number => {
    const phase = lobbyPhase({
      status: q.status,
      scheduledStart: q.scheduledStart,
      lobbyOpenLeadMs: q.lobbyOpenLeadMs,
      now,
    });
    if (phase === "live") return 100;
    if (phase === "starting") return 90;
    if (phase === "lobby-open") return 80;
    if (phase === "pre-lobby") return 50;
    return 10;
  };
  return [...quizzes].sort((a, b) => score(b) - score(a))[0] ?? null;
}

// Maps quiz.coverColor token to a primary→secondary gradient pair.
const COVER_GRADIENT: Record<string, { from: string; to: string; shade: string }> = {
  primary: { from: "var(--primary)", to: "var(--sky)", shade: "var(--primary-shade)" },
  berry: { from: "var(--berry)", to: "var(--accent)", shade: "var(--berry-shade)" },
  sky: { from: "var(--sky)", to: "var(--primary)", shade: "var(--sky-shade)" },
  accent: { from: "var(--accent)", to: "var(--berry)", shade: "var(--accent-shade)" },
  ink: { from: "var(--ink)", to: "var(--sky)", shade: "var(--ink)" },
};

function coverGradient(token: string | null | undefined) {
  return COVER_GRADIENT[token ?? "primary"] ?? COVER_GRADIENT.primary!;
}

function FeaturedHero({ quiz, now }: { quiz: PublicQuiz; now: number }) {
  const phase = lobbyPhase({
    status: quiz.status,
    scheduledStart: quiz.scheduledStart,
    lobbyOpenLeadMs: quiz.lobbyOpenLeadMs,
    now,
  });
  const isLive = phase === "live";
  const lobbyOpen = phase === "lobby-open" || phase === "starting";
  const startMs = quiz.scheduledStart ? new Date(quiz.scheduledStart).getTime() : null;
  const lobbyOpenMs = startMs ? startMs - quiz.lobbyOpenLeadMs : null;
  const totalUsdt = quiz.prizeAmounts.reduce(
    (sum, a) => sum + Number(a || 0),
    0,
  );
  const prizePoolLabel = formatTokenAmount(totalUsdt);
  const grad = coverGradient(quiz.coverColor);

  // Banner copy depends on phase.
  const subline =
    phase === "live"
      ? `${quiz.playerCount} playing now`
      : phase === "lobby-open" && startMs
        ? `Starts in ${formatMsLabel(startMs - now)}`
        : phase === "starting"
          ? quiz.quorumMet
            ? "Starting now!"
            : `${quiz.playersNeeded} more needed to start`
          : phase === "pre-lobby" && lobbyOpenMs
            ? `Lobby opens in ${formatMsLabel(lobbyOpenMs - now)}`
            : `Scheduled · $${prizePoolLabel} USDT pool`;

  const cta = isLive ? "JOIN LIVE" : lobbyOpen ? "JOIN NOW" : "VIEW";

  return (
    <Link
      href={lobbyOpen || isLive ? `/play/${quiz.code}` : `/play/${quiz.code}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 22,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
          padding: 18,
          color: "white",
          minHeight: 160,
          boxShadow: `0 6px 0 0 ${grad.shade}`,
          border: `2px solid ${grad.shade}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -10,
            bottom: -20,
            width: 130,
            height: 130,
            opacity: 0.95,
          }}
        >
          <Mango pose={isLive ? "cheer" : "wave"} size={140} />
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: "62%" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.25)",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              letterSpacing: 0.1,
              marginBottom: 10,
            }}
          >
            <span
              className={isLive ? "mq-pulse" : ""}
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: "white",
                display: "inline-block",
              }}
            />
            {isLive ? "LIVE NOW" : lobbyOpen ? "LOBBY OPEN" : "SCHEDULED"}
          </div>
          <div className="mq-h2" style={{ color: "white", fontSize: 22, marginBottom: 4 }}>
            {quiz.title}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.92, marginBottom: 12 }}>
            ${prizePoolLabel} USDT pool · {quiz.playerCount}/{quiz.minParticipants} joined
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{subline}</div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "white",
              color: "var(--primary-shade)",
              padding: "8px 14px",
              borderRadius: 999,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 13,
              boxShadow: "0 3px 0 0 rgba(0,0,0,0.15)",
            }}
          >
            <Icon name="play" size={12} color="var(--primary-shade)" /> {cta}
          </span>
        </div>
      </div>
    </Link>
  );
}

function UpNextRow({ quiz, now }: { quiz: PublicQuiz; now: number }) {
  const phase = lobbyPhase({
    status: quiz.status,
    scheduledStart: quiz.scheduledStart,
    lobbyOpenLeadMs: quiz.lobbyOpenLeadMs,
    now,
  });
  const startMs = quiz.scheduledStart ? new Date(quiz.scheduledStart).getTime() : null;
  const lobbyOpenMs = startMs ? startMs - quiz.lobbyOpenLeadMs : null;
  const totalUsdt = quiz.prizeAmounts.reduce(
    (sum, a) => sum + Number(a || 0),
    0,
  );
  const prizePoolLabel = formatTokenAmount(totalUsdt);
  const countdown =
    phase === "lobby-open" && startMs
      ? `Starts in ${formatMsLabel(startMs - now)}`
      : phase === "pre-lobby" && lobbyOpenMs
        ? `Lobby in ${formatMsLabel(lobbyOpenMs - now)}`
        : phase === "live"
          ? "Live"
          : phase === "starting"
            ? quiz.quorumMet
              ? "Starting"
              : `${quiz.playersNeeded} needed`
            : "Scheduled";

  return (
    <Link href={`/play/${quiz.code}`} style={{ textDecoration: "none", color: "inherit" }}>
      <MQCard
        style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--bg)",
            border: "2px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 14,
              color: "var(--ink)",
            }}
          >
            {formatLocal(quiz.scheduledStart, { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mq-h3" style={{ fontSize: 16, marginBottom: 4 }}>
            {quiz.title}
          </div>
          <div className="mq-body" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--accent-shade)", fontWeight: 800 }}>
              ${prizePoolLabel} USDT
            </span>{" "}
            · {quiz.questionCount} questions
          </div>
        </div>
        <Pill style={{ fontSize: 11, padding: "6px 10px" }}>
          {countdown}
        </Pill>
      </MQCard>
    </Link>
  );
}

function NoQuizzesCard() {
  return (
    <MQCard style={{ padding: 24, textAlign: "center" }}>
      <Mango pose="sleep" size={120} />
      <div className="mq-h3" style={{ marginTop: 8 }}>No quizzes scheduled</div>
      <p className="mq-body" style={{ fontSize: 13, marginTop: 4 }}>
        Mango is taking a nap. Check back soon for the next live game.
      </p>
    </MQCard>
  );
}

function formatMsLabel(ms: number): string {
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}
