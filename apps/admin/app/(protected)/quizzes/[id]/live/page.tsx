"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminQuiz, LeaderboardRow } from "@mini-quiz/shared";
import { TopBar } from "@/components/TopBar";
import { QuizStatusPill } from "@/components/StatusPill";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { AdminIcon } from "@/components/AdminIcon";
import { AnswerDistribution } from "@/components/AnswerDistribution";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { adminApi } from "@/lib/admin-api";
import { useLiveState } from "@/lib/use-live-state";
import { Countdown } from "@/components/Countdown";
import { QRDisplay } from "@/components/QRDisplay";
import { formatLocal } from "@/lib/time";

export default function LiveProjectorPage({
  params,
}: {
  params: { id: string };
}) {
  // Quiz metadata (title/code/prizes/schedule). Fetched once; SSE keeps the
  // status field in sync via the hook below.
  const [quiz, setQuiz] = useState<AdminQuiz | null>(null);
  const [ending, setEnding] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.get<{ quiz: AdminQuiz }>(
          `/admin/quizzes/${params.id}`,
        );
        if (cancelled) return;
        setQuiz(data.quiz);
        const quizBase =
          process.env.NEXT_PUBLIC_QUIZ_BASE_URL ?? "http://localhost:3000";
        setPlayUrl(`${quizBase}/play/${data.quiz.code}`);
      } catch (e) {
        if (!cancelled)
          setPageError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const { live, secondsRemaining, error: liveError } = useLiveState(
    params.id,
    quiz?.code ?? null,
  );

  const onEndGame = async () => {
    if (!quiz) return;
    if (!confirm(`End "${quiz.title}" now? Auto-payouts will run immediately.`))
      return;
    setEnding(true);
    try {
      await adminApi.post(`/admin/quizzes/${params.id}/end`);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "End failed");
    } finally {
      setEnding(false);
    }
  };

  // Effective status: SSE-driven if we have live state; otherwise the
  // initially-fetched quiz status. This avoids the "still says SCHEDULED for
  // 5 seconds" lag that the old polled version showed.
  const effectiveStatus = live?.status ?? quiz?.status;
  const isLive = effectiveStatus === "LIVE";
  const isScheduled = effectiveStatus === "SCHEDULED";
  const isEnded = effectiveStatus === "ENDED" || effectiveStatus === "ARCHIVED";

  const thinkingCount = Math.max(
    0,
    (live?.activePlayers ?? 0) - (live?.answeredCount ?? 0),
  );

  const error = pageError ?? liveError;

  return (
    <>
      <TopBar
        title={quiz ? `Live · ${quiz.title}` : "Live"}
        crumbs="Games"
      />
      <div className="adm-content">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--a-wrong-tint)",
              color: "var(--a-wrong)",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {!quiz || !live ? (
          <div style={{ color: "var(--a-ink-faint)" }}>Loading…</div>
        ) : (
          <>
            <div className="adm-page-h">
              <div>
                <div className="adm-crumbs">Games / {quiz.title}</div>
                <h1
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {quiz.title}{" "}
                  <QuizStatusPill status={effectiveStatus ?? quiz.status} />
                  {/* Auto-end indicator. Makes it explicit that the scheduler
                    * ends the game automatically — admins shouldn't think
                    * they need to click anything. */}
                  {isLive && secondsRemaining != null && (
                    <span
                      title="The scheduler ends this quiz automatically when the timer hits zero."
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 0.04,
                        textTransform: "uppercase",
                        background: "var(--a-bg)",
                        color: "var(--a-ink-soft)",
                        border: "1px solid var(--a-line)",
                      }}
                    >
                      <AdminIcon name="clock" size={11} color="currentColor" />
                      Auto-ends in {formatRemaining(secondsRemaining)}
                    </span>
                  )}
                </h1>
              </div>
            </div>

            <KpiGrid>
              <KpiCard
                label="Question"
                value={
                  live.currentQuestionPosition != null
                    ? `${live.currentQuestionPosition + 1} / ${live.totalQuestions}`
                    : `— / ${live.totalQuestions}`
                }
                delta={
                  isLive && secondsRemaining != null
                    ? `${secondsRemaining}s remaining`
                    : isScheduled
                      ? "Not started"
                      : "Ended"
                }
              />
              <KpiCard
                label="Active players"
                value={live.activePlayers.toLocaleString()}
              />
              <KpiCard label="Avg correct" value={`${live.avgCorrectPct}%`} />
              <KpiCard
                label="Pool USDT"
                value={`$${quiz.prizeAmounts
                  .reduce((a, b) => a + Number(b || 0), 0)
                  .toString()}`}
                delta={`Top ${quiz.prizeAmounts.length} winners`}
              />
            </KpiGrid>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr",
                gap: 16,
              }}
            >
              {/* Distribution */}
              <div className="adm-card">
                <div className="adm-card-h">
                  <h3>
                    {live.currentQuestionPosition != null
                      ? `Q${live.currentQuestionPosition + 1} · Live answer distribution`
                      : "Answer distribution"}
                  </h3>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--a-ink-faint)",
                      fontWeight: 700,
                    }}
                  >
                    {live.answeredCount} answered · {thinkingCount} thinking
                  </div>
                </div>
                <div style={{ padding: 18 }}>
                  <AnswerDistribution
                    prompt={live.currentQuestionPrompt}
                    choices={live.currentQuestionChoices}
                    correctChoiceId={live.currentQuestionCorrectChoiceId}
                    distribution={live.distribution}
                    answeredCount={live.answeredCount}
                    thinkingCount={thinkingCount}
                  />
                </div>
              </div>

              {/* Leaderboard + side panel */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>Live leaderboard</h3>
                  </div>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th className="num">Score</th>
                        <th className="num">Correct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.leaderboard.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            style={{ color: "var(--a-ink-faint)", padding: 16 }}
                          >
                            No answers yet.
                          </td>
                        </tr>
                      ) : (
                        live.leaderboard
                          .slice(0, 7)
                          .map((row: LeaderboardRow, idx) => (
                            <tr key={row.roomPlayerId}>
                              <td
                                className="num"
                                style={{
                                  fontWeight: 800,
                                  color:
                                    idx <= 2
                                      ? "var(--a-gold)"
                                      : "var(--a-ink-soft)",
                                }}
                              >
                                {idx + 1}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <AdminAvatar
                                    emoji={row.avatarEmoji}
                                    color={row.avatarColor}
                                    initials={initialsOf(row.displayName)}
                                  />
                                  <span style={{ fontWeight: 700 }}>
                                    {row.displayName}
                                  </span>
                                </div>
                              </td>
                              <td className="num" style={{ fontWeight: 800 }}>
                                {row.points.toLocaleString()}
                              </td>
                              <td className="num">{row.correctCount}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>

                {playUrl && (
                  <div className="adm-card">
                    <div className="adm-card-h">
                      <h3>Projector</h3>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--a-ink-faint)",
                          fontWeight: 700,
                        }}
                      >
                        Code{" "}
                        <span
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            color: "var(--a-ink)",
                          }}
                        >
                          {quiz.code}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 18,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <QRDisplay url={playUrl} size={160} />
                      {quiz.scheduledStart && isScheduled && (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--a-ink-faint)",
                              fontWeight: 700,
                            }}
                          >
                            Starts at{" "}
                            {formatLocal(quiz.scheduledStart, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "UTC",
                            })}{" "}
                            UTC
                          </div>
                          <Countdown
                            to={new Date(quiz.scheduledStart).getTime()}
                            size="sm"
                          />
                        </>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "10px 18px",
                        borderTop: "1px solid var(--a-line)",
                        textAlign: "center",
                      }}
                    >
                      <Link
                        href={playUrl}
                        target="_blank"
                        className="adm-btn adm-btn--sm"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        Open join link
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Force-end escape hatch. The scheduler ends LIVE quizzes
              * automatically when their duration elapses, so this is only
              * for stuck games (e.g. a broken question or a network blip
              * that prevented the auto-end tick from running). Tucked at
              * the bottom of the page so it isn't the primary action. */}
            {isLive && (
              <div
                style={{
                  marginTop: 24,
                  padding: 14,
                  borderRadius: 10,
                  border: "1px dashed var(--a-line)",
                  background: "var(--a-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--a-ink-soft)" }}>
                  This quiz auto-ends when the timer hits zero. Use{" "}
                  <strong>Force end</strong> only if it&apos;s stuck.
                </div>
                <button
                  type="button"
                  onClick={onEndGame}
                  disabled={ending || isEnded}
                  className="adm-btn adm-btn--sm"
                  style={{ color: "var(--a-wrong)" }}
                >
                  {ending ? "Ending…" : "Force end"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// Format a remaining-seconds count as "Mm Ss" or "Ns". Used by the
// live monitor's auto-ends indicator.
function formatRemaining(secs: number): string {
  if (secs <= 0) return "0s";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
