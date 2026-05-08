"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
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
  const toast = useToast();

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

  // Tab-driven view: Upcoming (default) shows scheduled + currently-live
  // dailies sorted desc by date; History shows finished snapshots same order.
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const sortedUpcoming = [...upcoming].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );
  const sortedPast = [...past].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );
  const rows = tab === "upcoming" ? sortedUpcoming : sortedPast;

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete daily quiz "${label}"? This cannot be undone.`)) return;
    try {
      await adminApi.del(`/admin/daily/${id}`);
      toast.success(`Deleted "${label}"`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <>
      <TopBar title="Daily quiz" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Daily" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>Daily quiz</h1>
            <div className="adm-crumbs">
              {upcoming.length} scheduled · {past.length} in history
            </div>
          </div>
          <div className="actions">
            <Link href="/daily/new" className="adm-btn adm-btn--primary">
              <AdminIcon name="plus" size={14} color="white" /> New daily
            </Link>
          </div>
        </div>
        {error && (
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)" }}>
            {error}
          </div>
        )}

        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div
            className="adm-card-h"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div className="adm-tabs" style={{ borderBottom: "none", margin: 0 }}>
              <button
                type="button"
                className={`adm-tab${tab === "upcoming" ? " active" : ""}`}
                onClick={() => setTab("upcoming")}
              >
                Upcoming · {upcoming.length}
              </button>
              <button
                type="button"
                className={`adm-tab${tab === "history" ? " active" : ""}`}
                onClick={() => setTab("history")}
              >
                History · {past.length}
              </button>
            </div>
          </div>

          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Status</th>
                <th>Questions</th>
                <th>Players</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: "var(--a-ink-faint)" }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: "var(--a-ink-faint)" }}>
                    {tab === "upcoming"
                      ? "Nothing scheduled. Click “New daily” to create one."
                      : "No daily history yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace" }}>
                      {row.date ?? "—"}
                    </td>
                    <td>{row.title}</td>
                    <td>
                      <QuizStatusPill status={row.status as QuizStatus} />
                    </td>
                    <td>{row.questionCount}</td>
                    <td>{row.playerCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <Link
                          href={`/daily/${row.id}`}
                          className="adm-btn adm-btn--sm"
                        >
                          {tab === "upcoming" ? "Edit" : "View"}
                        </Link>
                        {tab === "upcoming" &&
                          row.status !== "LIVE" &&
                          row.status !== "ENDED" && (
                            <button
                              type="button"
                              className="adm-btn adm-btn--sm adm-btn--danger"
                              onClick={() => void remove(row.id, row.title)}
                            >
                              Delete
                            </button>
                          )}
                      </div>
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
