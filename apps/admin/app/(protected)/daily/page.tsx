"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";
import { QuizStatusPill } from "@/components/StatusPill";
import type { QuizStatus } from "@mini-quiz/shared";

type DailyRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  date: string | null;
  questionCount: number;
  playerCount: number;
  winnerUserId?: string | null;
};

export default function DailyListPage() {
  const [upcoming, setUpcoming] = useState<DailyRow[]>([]);
  const [past, setPast] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.get<{ upcoming: DailyRow[]; past: DailyRow[] }>(
        "/admin/daily",
      );
      setUpcoming(data.upcoming);
      setPast(data.past);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Build a 14-day calendar grid starting today UTC.
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const grid: { date: string; row: DailyRow | null }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(todayUtc.getTime() + i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    grid.push({
      date: dateStr,
      row: upcoming.find((u) => u.date === dateStr) ?? null,
    });
  }

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete daily quiz "${label}"? This cannot be undone.`)) return;
    try {
      await adminApi.del(`/admin/daily/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <>
      <TopBar
        title="Daily quiz"
        primaryAction={
          <Link href="/daily/new" className="adm-btn adm-btn--primary">
            <AdminIcon name="plus" size={14} color="white" /> New daily
          </Link>
        }
      />
      <div className="adm-main">
        {error && (
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)" }}>
            {error}
          </div>
        )}
        <div className="adm-card">
          <div className="adm-card-h">
            <h3>Next 14 days</h3>
            <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
              {upcoming.length} scheduled
            </span>
          </div>
          <div
            style={{
              padding: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {grid.map((cell) => {
              const dateLabel = new Date(`${cell.date}T00:00:00Z`).toLocaleDateString(
                undefined,
                { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" },
              );
              return (
                <div
                  key={cell.date}
                  className="adm-card"
                  style={{ padding: 12, minHeight: 110 }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--a-ink-faint)",
                      marginBottom: 6,
                    }}
                  >
                    {dateLabel} · UTC
                  </div>
                  {cell.row ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                        {cell.row.title}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <QuizStatusPill status={cell.row.status as QuizStatus} />
                        <span style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                          {cell.row.questionCount} qs
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link
                          href={`/daily/${cell.row.id}`}
                          className="adm-btn adm-btn--sm"
                        >
                          Edit
                        </Link>
                        {cell.row.status !== "LIVE" && cell.row.status !== "ENDED" && (
                          <button
                            type="button"
                            className="adm-btn adm-btn--sm adm-btn--danger"
                            onClick={() => void remove(cell.row!.id, cell.row!.title)}
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Link
                      href={`/daily/new?date=${cell.date}`}
                      className="adm-btn adm-btn--sm"
                      style={{ marginTop: 12 }}
                    >
                      <AdminIcon name="plus" size={12} color="currentColor" /> Schedule
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-h">
            <h3>History</h3>
            <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
              Last 30 dailies
            </span>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Status</th>
                <th>Players</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && past.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, color: "var(--a-ink-faint)" }}>
                    Loading…
                  </td>
                </tr>
              ) : past.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, color: "var(--a-ink-faint)" }}>
                    No daily history yet.
                  </td>
                </tr>
              ) : (
                past.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.title}</td>
                    <td>
                      <QuizStatusPill status={row.status as QuizStatus} />
                    </td>
                    <td>{row.playerCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/daily/${row.id}`} className="adm-btn adm-btn--sm">
                        View
                      </Link>
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
