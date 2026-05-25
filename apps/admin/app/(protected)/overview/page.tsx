"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminStats } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { QuizStatusPill, CustomPill } from "@/components/StatusPill";
import { AdminIcon } from "@/components/AdminIcon";
import { formatLocal } from "@/lib/time";

export default function OverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Locale-formatted date is computed on the client only — server and client
  // locales diverge and produce a hydration mismatch otherwise.
  const [todayLabel, setTodayLabel] = useState<string>("");
  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await adminApi.get<AdminStats>("/admin/stats");
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <TopBar title="Overview" crumbs={todayLabel} />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>Good day, Admin</h1>
            <div
              className="text-sm"
              style={{ color: "var(--a-ink-soft)", fontWeight: 600, marginTop: 2 }}
            >
              {stats?.liveQuiz ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="adm-badge live">LIVE</span>
                  <b>{stats.liveQuiz.title}</b> — {stats.liveQuiz.activePlayers} playing,
                  {" "}
                  Q {stats.liveQuiz.currentQuestion}/{stats.liveQuiz.totalQuestions}
                </span>
              ) : (
                <span>No game in progress.</span>
              )}
            </div>
          </div>
          <div className="actions">
            {stats?.liveQuiz && (
              <Link
                href={`/quizzes/${stats.liveQuiz.quizId}/live`}
                className="adm-btn adm-btn--primary"
              >
                <AdminIcon name="eye" size={14} color="white" /> Watch live
              </Link>
            )}
            <Link href="/quizzes/new" className="adm-btn">
              <AdminIcon name="plus" size={14} /> New game
            </Link>
          </div>
        </div>

        {error && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--a-wrong-tint)",
              color: "var(--a-wrong)",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <KpiGrid>
          <KpiCard
            label="Players today"
            value={stats?.kpis.playersToday ?? "—"}
            delta={
              stats
                ? `${stats.kpis.playersTodayDelta >= 0 ? "▲" : "▼"} ${Math.abs(
                    stats.kpis.playersTodayDelta,
                  )} vs yesterday`
                : "—"
            }
            tone={
              stats && stats.kpis.playersTodayDelta >= 0 ? "up" : "down"
            }
          />
          <KpiCard
            label="Games today"
            value={
              stats
                ? `${stats.kpis.gamesRunToday} / ${
                    stats.kpis.gamesRunToday + stats.kpis.gamesScheduledToday
                  }`
                : "—"
            }
            delta={
              stats
                ? stats.kpis.gamesScheduledToday > 0
                  ? `${stats.kpis.gamesScheduledToday} scheduled`
                  : "All complete"
                : "—"
            }
          />
          <KpiCard
            label="Pool today"
            value={stats ? `$${stats.kpis.poolUsdtToday}` : "—"}
          />
          <KpiCard
            label="Auto-paid today"
            value={stats ? `$${stats.kpis.paidUsdtToday}` : "—"}
            delta={
              stats
                ? `${stats.kpis.failedPayoutsToday > 0 ? `${stats.kpis.failedPayoutsToday} failed` : "100% delivered"}`
                : "—"
            }
            tone={stats && stats.kpis.failedPayoutsToday > 0 ? "down" : "up"}
          />
        </KpiGrid>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          {/* Today's games */}
          <div className="adm-card">
            <div className="adm-card-h">
              <h3>Today's games</h3>
              <Link href="/quizzes" className="adm-btn adm-btn--sm">
                View all <AdminIcon name="chevron-r" size={12} />
              </Link>
            </div>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Game</th>
                  <th>Time (UTC)</th>
                  <th className="num">Players</th>
                  <th className="num">Pool</th>
                  <th>Payouts</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!stats ? (
                  <tr>
                    <td colSpan={7} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                      Loading…
                    </td>
                  </tr>
                ) : stats.todaysGames.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                      No games today.
                    </td>
                  </tr>
                ) : (
                  stats.todaysGames.map((g) => (
                    <tr key={g.quizId}>
                      <td>
                        <QuizStatusPill status={g.status} />
                      </td>
                      <td>
                        <Link
                          href={`/quizzes/${g.quizId}`}
                          className="font-bold no-underline"
                          style={{ color: "var(--a-ink)" }}
                        >
                          {g.title}
                        </Link>
                      </td>
                      <td className="num" style={{ color: "var(--a-ink-soft)" }}>
                        {g.scheduledStart
                          ? formatLocal(g.scheduledStart, {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "UTC",
                            })
                          : "—"}
                      </td>
                      <td className="num">{g.playerCount}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        ${g.prizeTotalUsdt}
                      </td>
                      <td>
                        {g.payoutsState === "auto-paid" ? (
                          <CustomPill variant="paid">AUTO-PAID</CustomPill>
                        ) : g.payoutsState === "failed" ? (
                          <CustomPill variant="failed">FAILED</CustomPill>
                        ) : g.payoutsState === "partial" ? (
                          <CustomPill variant="processing">SENDING</CustomPill>
                        ) : (
                          <span style={{ color: "var(--a-ink-faint)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {g.status === "LIVE" ? (
                          <Link
                            href={`/quizzes/${g.quizId}/live`}
                            className="adm-btn adm-btn--sm"
                          >
                            <AdminIcon name="eye" size={12} /> Watch
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="adm-card">
              <div className="adm-card-h">
                <h3>Players · last 7 days</h3>
              </div>
              <div style={{ padding: 16 }}>
                {stats?.playersTrend ? (
                  <PlayersBars trend={stats.playersTrend} />
                ) : (
                  <div style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>Loading…</div>
                )}
              </div>
            </div>

            <div className="adm-card">
              <div className="adm-card-h">
                <h3>Needs attention</h3>
              </div>
              <div>
                {stats?.attention.failedPayouts.count === 0 &&
                stats?.attention.flaggedUsers === 0 ? (
                  <div style={{ padding: 18, color: "var(--a-ink-faint)", fontSize: 13 }}>
                    Nothing here. Nice and quiet.
                  </div>
                ) : (
                  <>
                    {stats && stats.attention.failedPayouts.count > 0 && (
                      <Attention
                        icon="alert"
                        tone="wrong"
                        title={`${stats.attention.failedPayouts.count} payouts failed`}
                        sub={`$${stats.attention.failedPayouts.sumUsdt} stuck — retry or investigate`}
                        href="/payouts?status=FAILED"
                      />
                    )}
                    {stats && stats.attention.flaggedUsers > 0 && (
                      <Attention
                        icon="flag"
                        tone="berry"
                        title={`${stats.attention.flaggedUsers} flagged players`}
                        sub="Review the moderation queue"
                        href="/players?flagged=true"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PlayersBars({ trend }: { trend: AdminStats["playersTrend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.count));
  return (
    <div>
      <div className="adm-bars">
        {trend.map((t, i) => {
          const isToday = i === trend.length - 1;
          return (
            <div
              key={t.day}
              title={`${t.day}: ${t.count}`}
              style={{
                height: `${Math.max(4, (t.count / max) * 100)}%`,
                background: isToday ? "var(--a-primary)" : "var(--a-primary-tint)",
                borderTop: isToday ? "none" : "1px solid var(--a-primary)",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 10,
          color: "var(--a-ink-faint)",
          fontWeight: 700,
        }}
      >
        {trend.map((t, i) => (
          <span key={t.day}>
            {i === trend.length - 1
              ? "Today"
              : new Date(t.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ))}
      </div>
    </div>
  );
}

function Attention({
  icon,
  tone,
  title,
  sub,
  href,
}: {
  icon: "alert" | "cash" | "flag";
  tone: "wrong" | "accent" | "berry";
  title: string;
  sub: string;
  href: string;
}) {
  const colors: Record<typeof tone, string> = {
    wrong: "var(--a-wrong)",
    accent: "var(--a-accent)",
    berry: "var(--a-berry)",
  };
  const tints: Record<typeof tone, string> = {
    wrong: "var(--a-wrong-tint)",
    accent: "var(--a-accent-tint)",
    berry: "var(--a-berry-tint)",
  };
  return (
    <Link
      href={href}
      className="no-underline"
      style={{
        padding: "12px 18px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        borderBottom: "1px solid var(--a-line-soft)",
        color: "var(--a-ink)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: tints[tone],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <AdminIcon name={icon} size={14} color={colors[tone]} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--a-ink-faint)", fontWeight: 600 }}>{sub}</div>
      </div>
      <AdminIcon name="chevron-r" size={14} color="var(--a-ink-faint)" />
    </Link>
  );
}
