"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LeaderboardRow } from "@mini-quiz/shared";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { api } from "@/lib/api-client";
import { useProfile } from "@/lib/profile-context";

type DailyToday =
  | {
      kind: "active";
      quizId: string;
      title: string;
      description: string | null;
      dailyDate: string;
      questionCount: number;
      sessionMs: number;
      questionTimeMs: number;
      progress: {
        startedAt: string | null;
        expiresAt: string | null;
        finished: boolean;
        answeredCount: number;
        scoreCorrect: number;
        scoreTotal: number;
      } | null;
    }
  | { kind: "none" };

type LeaderboardResponse = {
  rows: LeaderboardRow[];
  date: string;
  finalized: boolean;
};

function utcDateStr(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function DailyHubPage() {
  const { state } = useProfile();
  const wallet =
    state.status === "ready" || state.status === "needs-onboarding"
      ? state.walletAddress
      : null;
  const [today, setToday] = useState<DailyToday | null>(null);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [yesterday, setYesterday] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoading(true);
      try {
        const t = await api.get<DailyToday>(
          `/daily/today${wallet ? `?walletAddress=${wallet}` : ""}`,
        );
        if (cancel) return;
        setToday(t);
        if (t.kind === "active") {
          try {
            const lb = await api.get<LeaderboardResponse>("/daily/leaderboard");
            if (!cancel) setBoard(lb);
          } catch {
            // ok if no plays yet
          }
        }
        const yDate = new Date();
        yDate.setUTCDate(yDate.getUTCDate() - 1);
        try {
          const ylb = await api.get<LeaderboardResponse>(
            `/daily/leaderboard?date=${utcDateStr(yDate)}`,
          );
          if (!cancel) setYesterday(ylb);
        } catch {
          // no daily yesterday
        }
      } catch (e) {
        if (!cancel)
          setError(e instanceof Error ? e.message : "Could not load daily");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [wallet]);

  const myRank = useMemo(() => {
    if (!board || state.status !== "ready") return null;
    const myId = state.user.id;
    const idx = board.rows.findIndex((r) => r.userId === myId);
    return idx >= 0 ? idx + 1 : null;
  }, [board, state]);

  if (loading) {
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        Loading daily…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!today || today.kind === "none") {
    return (
      <div
        className="mq-page"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        <Mango pose="sleep" size={120} />
        <h1 className="mq-h1">No daily today</h1>
        <p className="mq-body" style={{ color: "var(--ink-faint)" }}>
          Come back tomorrow at 00:00 UTC.
        </p>
        {yesterday && yesterday.rows.length > 0 && (
          <YesterdayBlock board={yesterday} />
        )}
      </div>
    );
  }

  const finished = today.progress?.finished;
  const inProgress = today.progress?.startedAt && !finished;

  return (
    <div className="mq-page" style={{ padding: 16, display: "grid", gap: 16 }}>
      <MQCard style={{ padding: 18 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}
        >
          <Pill>Daily · {today.dailyDate} UTC</Pill>
          {finished && <Pill className="mq-pill--good">Done</Pill>}
        </div>
        <h1 className="mq-h1" style={{ marginTop: 4 }}>{today.title}</h1>
        {today.description && (
          <p className="mq-body" style={{ color: "var(--ink-faint)", marginTop: 6 }}>
            {today.description}
          </p>
        )}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 16,
            fontSize: 13,
            color: "var(--ink-faint)",
          }}
        >
          <span>
            <Icon name="clock" size={14} color="currentColor" />{" "}
            {today.questionCount} qs · {Math.round(today.sessionMs / 1000)}s
          </span>
          {today.progress && (
            <span>
              {today.progress.answeredCount}/{today.questionCount} answered
            </span>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          {finished ? (
            <MQButton variant="ghost" disabled block>
              You played today — score {today.progress!.scoreCorrect}/{today.questionCount}
            </MQButton>
          ) : (
            <Link href="/daily/play" style={{ textDecoration: "none" }}>
              <MQButton variant="primary" block>
                {inProgress ? "Resume daily" : "Play daily"}
              </MQButton>
            </Link>
          )}
        </div>
      </MQCard>

      {board && board.rows.length > 0 && (
        <MQCard style={{ padding: 18 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}
          >
            <h2 className="mq-h2">Today's leaderboard</h2>
            {myRank && <Pill>You · #{myRank}</Pill>}
          </div>
          <LeaderboardTable rows={board.rows.slice(0, 10)} />
        </MQCard>
      )}

      {yesterday && yesterday.rows.length > 0 && (
        <YesterdayBlock board={yesterday} />
      )}
    </div>
  );
}

function YesterdayBlock({ board }: { board: LeaderboardResponse }) {
  const winner = board.rows[0];
  return (
    <MQCard style={{ padding: 18 }}>
      <h2 className="mq-h2" style={{ marginBottom: 12 }}>Yesterday</h2>
      {winner ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderRadius: 12,
            background: "var(--gold-bg, #fef3c7)",
          }}
        >
          <span style={{ fontSize: 22 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{winner.displayName}</div>
            <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              Daily champ · {winner.points} pts
            </div>
          </div>
        </div>
      ) : (
        <p style={{ color: "var(--ink-faint)" }}>No winners yet.</p>
      )}
      <div style={{ marginTop: 12 }}>
        <LeaderboardTable rows={board.rows.slice(0, 5)} />
      </div>
    </MQCard>
  );
}

function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((r, i) => (
        <div
          key={r.userId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 8,
            borderRadius: 10,
            background: "var(--surface-2, rgba(0,0,0,0.03))",
          }}
        >
          <span style={{ width: 24, fontWeight: 800 }}>#{i + 1}</span>
          <Avatar
            emoji={r.avatarEmoji ?? "🐒"}
            color={r.avatarColor ?? "berry"}
            size={28}
          />
          <span style={{ flex: 1, fontWeight: 600 }}>{r.displayName}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
            {r.points}
          </span>
        </div>
      ))}
    </div>
  );
}
