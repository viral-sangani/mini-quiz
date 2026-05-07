"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminQuiz, QuizStatus } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { QuizStatusPill } from "@/components/StatusPill";
import { AdminIcon } from "@/components/AdminIcon";
import { Sparkline } from "@/components/Sparkline";
import { formatLocal } from "@/lib/time";

type StatusFilter = QuizStatus | "ALL";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "LIVE", label: "Live" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "DRAFT", label: "Drafts" },
  { id: "ENDED", label: "Ended" },
];

function sumUsdt(amounts: string[]): string {
  let total = 0;
  for (const a of amounts) {
    const n = Number(a);
    if (Number.isFinite(n)) total += n;
  }
  return Number(total.toFixed(6)).toString();
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams();
        if (status !== "ALL") q.set("status", status);
        if (includeArchived) q.set("archived", "true");
        const data = await adminApi.get<{ quizzes: AdminQuiz[] }>(
          `/admin/quizzes?${q.toString()}`,
        );
        if (!cancelled) setQuizzes(data.quizzes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, includeArchived]);

  const filtered = useMemo(() => {
    if (!search) return quizzes;
    const needle = search.toLowerCase();
    return quizzes.filter(
      (q) =>
        q.title.toLowerCase().includes(needle) ||
        q.code.toLowerCase().includes(needle),
    );
  }, [quizzes, search]);

  const counts = useMemo(() => {
    const c = { live: 0, scheduled: 0, draft: 0, ended: 0 };
    for (const q of quizzes) {
      if (q.status === "LIVE") c.live++;
      else if (q.status === "SCHEDULED") c.scheduled++;
      else if (q.status === "DRAFT") c.draft++;
      else if (q.status === "ENDED") c.ended++;
    }
    return c;
  }, [quizzes]);

  return (
    <>
      <TopBar title="Games" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>Games</h1>
            <div className="adm-crumbs">
              {quizzes.length} total · {counts.live} live · {counts.scheduled} scheduled · {counts.draft} draft
            </div>
          </div>
          <div className="actions">
            <Link href="/quizzes/new" className="adm-btn adm-btn--primary">
              <AdminIcon name="plus" size={14} color="white" /> New game
            </Link>
          </div>
        </div>

        <div className="adm-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={`adm-chip${status === f.id ? " active" : ""}`}
            >
              {f.label}
            </button>
          ))}
          <label
            className="ml-2 flex items-center gap-2"
            style={{ fontSize: 12, fontWeight: 700, color: "var(--a-ink-soft)" }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Include archived
          </label>
          <div style={{ flex: 1 }} />
          <div className="adm-search" style={{ maxWidth: 240 }}>
            <AdminIcon name="search" size={13} color="var(--a-ink-faint)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games…"
              style={{
                background: "transparent",
                border: 0,
                outline: 0,
                width: "100%",
                color: "var(--a-ink)",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

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

        <div className="adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Game</th>
                <th>Schedule (UTC)</th>
                <th>Difficulty</th>
                <th className="num">Q's</th>
                <th className="num">Players</th>
                <th className="num">Pool USDT</th>
                <th>Trend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                    No games match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((q, i) => (
                  <tr key={q.id}>
                    <td>
                      <QuizStatusPill status={q.status} />
                    </td>
                    <td>
                      <Link
                        href={`/quizzes/${q.id}`}
                        className="font-bold no-underline"
                        style={{ color: "var(--a-ink)" }}
                      >
                        {q.title}
                      </Link>
                      <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                        {q.code}
                      </div>
                    </td>
                    <td className="num" style={{ color: "var(--a-ink-soft)" }}>
                      {q.scheduledStart
                        ? formatLocal(q.scheduledStart, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })
                        : "—"}
                    </td>
                    <td>
                      {q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase()}
                    </td>
                    <td className="num">{q.questionCount}</td>
                    <td className="num">{q.playerCount.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      ${sumUsdt(q.prizeAmounts)}
                    </td>
                    <td>
                      <Sparkline
                        values={[3, 5, 4, 7, 6, 9, 8, 11].map((x) => x + i)}
                      />
                    </td>
                    <td className="text-right">
                      {q.status === "LIVE" ? (
                        <Link
                          href={`/quizzes/${q.id}/live`}
                          className="adm-btn adm-btn--sm"
                        >
                          <AdminIcon name="eye" size={12} /> Watch
                        </Link>
                      ) : (
                        <Link
                          href={`/quizzes/${q.id}`}
                          style={{ color: "var(--a-primary)" }}
                          className="font-semibold no-underline text-sm"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
