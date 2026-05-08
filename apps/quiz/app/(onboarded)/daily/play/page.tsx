"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Choice, PublicQuestion } from "@mini-quiz/shared";
import { fireConfetti } from "@/components/ConfettiBurst";
import { Loader } from "@/components/Loader";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { ProgressBar } from "@/components/ProgressBar";
import { ApiError, api } from "@/lib/api-client";
import { useProfile } from "@/lib/profile-context";

type StartResp = {
  kind: "ok";
  roomPlayerId: string;
  quizId: string;
  startedAt: string;
  expiresAt: string;
  questions: PublicQuestion[];
  answeredQuestionIds: string[];
};

type AnswerResp = { isCorrect: boolean; points: number };
type FinishResp = {
  scoreCorrect: number;
  scoreTotal: number;
  rank: number | null;
  answeredCount: number;
  questionCount: number;
  newBadges: string[];
};

const TICK_MS = 200;

export default function DailyPlayPage() {
  const { state } = useProfile();
  const wallet = state.status === "ready" ? state.walletAddress : null;
  const [start, setStart] = useState<StartResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [picking, setPicking] = useState(false);
  // Picked tile id while we're awaiting the server response. Cleared on
  // advance to next question. Drives the "locked-in" optimistic visual.
  const [pickedChoiceId, setPickedChoiceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(
    null,
  );
  const [finish, setFinish] = useState<FinishResp | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const submittedSet = useRef<Set<string>>(new Set());

  // Boot: start (or resume) the daily play.
  useEffect(() => {
    let cancel = false;
    if (!wallet) return;
    void (async () => {
      try {
        const res = await api.post<StartResp>("/daily/start", {
          walletAddress: wallet,
        });
        if (cancel) return;
        setStart(res);
        for (const id of res.answeredQuestionIds) submittedSet.current.add(id);
        // Skip past already-answered questions.
        const firstUnanswered = res.questions.findIndex(
          (q) => !res.answeredQuestionIds.includes(q.id),
        );
        if (firstUnanswered >= 0) setIdx(firstUnanswered);
        else {
          // All answered — finalize immediately.
          await finalize(wallet);
        }
      } catch (e) {
        if (cancel) return;
        if (e instanceof ApiError && e.code === "FINISHED") {
          await finalize(wallet);
          return;
        }
        setError(e instanceof Error ? e.message : "Could not start daily");
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  // 200ms tick for the countdown.
  useEffect(() => {
    if (!start || finish) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [start, finish]);

  const expiresAt = start ? new Date(start.expiresAt).getTime() : 0;
  const remaining = Math.max(0, expiresAt - now);
  const totalMs = start ? expiresAt - new Date(start.startedAt).getTime() : 1;
  const elapsedRatio = start ? Math.min(1, 1 - remaining / totalMs) : 0;

  const finalize = useCallback(
    async (w: string) => {
      try {
        const res = await api.post<FinishResp>("/daily/finish", {
          walletAddress: w,
        });
        setFinish(res);
        if (res.scoreCorrect === res.questionCount && res.questionCount > 0) {
          fireConfetti();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not finish");
      }
    },
    [],
  );

  // Auto-finish when timer hits 0.
  useEffect(() => {
    if (!start || finish || !wallet) return;
    if (remaining <= 0) {
      void finalize(wallet);
    }
  }, [remaining, start, finish, wallet, finalize]);

  const submit = async (q: PublicQuestion, choiceId: string) => {
    if (!wallet || picking || pickedChoiceId) return;
    // Lock picked tile + dim siblings IMMEDIATELY (zero-latency feedback).
    setPicking(true);
    setPickedChoiceId(choiceId);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }
    const startedAt = new Date(start!.startedAt).getTime();
    const timeTakenMs = Math.min(
      20_000,
      Math.max(0, Math.floor((Date.now() - startedAt) - idx * 20_000)),
    );
    // Schedule advance from click time, NOT response time, so feedback hold
    // is consistent regardless of network latency.
    const advance = () => {
      setFeedback(null);
      setPickedChoiceId(null);
      if (idx + 1 >= start!.questions.length) {
        void finalize(wallet);
      } else {
        setIdx((i) => i + 1);
      }
    };
    let advanceTimer: ReturnType<typeof setTimeout> | null = setTimeout(advance, 1200);
    try {
      const res = await api.post<AnswerResp>("/daily/answer", {
        walletAddress: wallet,
        questionId: q.id,
        choiceId,
        timeTakenMs,
      });
      submittedSet.current.add(q.id);
      setFeedback({ correct: res.isCorrect, points: res.points });
      if (res.isCorrect) fireConfetti();
    } catch (e) {
      if (e instanceof ApiError && (e.code === "EXPIRED" || e.status === 410)) {
        if (advanceTimer) clearTimeout(advanceTimer);
        advanceTimer = null;
        void finalize(wallet);
      } else {
        // Server rejected — show neutral feedback so user knows tap didn't
        // earn points, then advance.
        setFeedback({ correct: false, points: 0 });
      }
    } finally {
      setPicking(false);
    }
  };

  if (state.status !== "ready") {
    return <Loader label="Getting you in…" pose="think" />;
  }

  if (error) {
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        <Mango pose="sleep" size={100} />
        <p style={{ marginTop: 16 }}>{error}</p>
        <Link href="/daily" style={{ textDecoration: "none" }}>
          <MQButton variant="ghost" block>
            Back to daily
          </MQButton>
        </Link>
      </div>
    );
  }

  if (finish) {
    return (
      <div
        className="mq-page"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Mango
          pose={finish.scoreCorrect === finish.questionCount ? "cheer" : "think"}
          size={140}
        />
        <h1 className="mq-h1">All done!</h1>
        <MQCard style={{ padding: 18, width: "100%", maxWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span>Correct</span>
            <strong>
              {finish.scoreCorrect}/{finish.questionCount}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span>Score</span>
            <strong>{finish.scoreTotal}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Rank</span>
            <strong>{finish.rank ? `#${finish.rank}` : "—"}</strong>
          </div>
          {finish.newBadges.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ display: "block", marginBottom: 6 }}>
                New badges
              </strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {finish.newBadges.map((b) => (
                  <Pill key={b}>{b.replace(/_/g, " ")}</Pill>
                ))}
              </div>
            </div>
          )}
        </MQCard>
        <Link href="/daily" style={{ textDecoration: "none", width: "100%", maxWidth: 360 }}>
          <MQButton variant="primary" block>
            Back to daily
          </MQButton>
        </Link>
      </div>
    );
  }

  if (!start) {
    return <Loader label="Starting today's daily…" pose="cheer" />;
  }

  const q = start.questions[idx];
  if (!q) {
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        Wrapping up…
      </div>
    );
  }

  return (
    <div
      className="mq-page"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: "100dvh",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Pill>
          Q{idx + 1} / {start.questions.length}
        </Pill>
        <Pill>{Math.ceil(remaining / 1000)}s left</Pill>
      </div>
      <ProgressBar pct={(1 - elapsedRatio) * 100} />

      <MQCard style={{ padding: 18, marginTop: 8 }}>
        <h2 className="mq-h2" style={{ marginBottom: 16 }}>{q.prompt}</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(q.choices as Choice[]).map((c) => {
            const isPicked = pickedChoiceId === c.id;
            const isLocked = pickedChoiceId !== null;
            return (
              <button
                key={c.id}
                type="button"
                disabled={isLocked}
                onClick={() => void submit(q, c.id)}
                className="mq-choice"
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: isPicked
                    ? "2px solid var(--primary)"
                    : "1px solid var(--ink-faint)",
                  background: isPicked
                    ? "var(--primary-bg, #dbeafe)"
                    : "var(--surface-1, white)",
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: 15,
                  opacity: isLocked && !isPicked ? 0.45 : 1,
                  cursor: isLocked ? "default" : "pointer",
                  transform: isPicked ? "translateY(1px)" : "none",
                  transition: "transform 80ms ease, background 120ms ease",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    marginRight: 8,
                    color: isPicked ? "var(--primary)" : "var(--primary)",
                  }}
                >
                  {c.id.toUpperCase()}.
                </span>
                {c.label}
                {isPicked && (
                  <span
                    style={{
                      float: "right",
                      fontSize: 12,
                      color: "var(--primary)",
                      fontWeight: 700,
                    }}
                  >
                    ✓ locked in
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </MQCard>

      {feedback && (
        <MQCard
          style={{
            padding: 14,
            background: feedback.correct ? "var(--good-bg, #d1fae5)" : "var(--wrong-bg, #fee2e2)",
            color: feedback.correct ? "var(--good, #065f46)" : "var(--wrong, #991b1b)",
            fontWeight: 700,
          }}
        >
          {feedback.correct ? `Nice! +${feedback.points} pts` : "Not quite."}
        </MQCard>
      )}
    </div>
  );
}
