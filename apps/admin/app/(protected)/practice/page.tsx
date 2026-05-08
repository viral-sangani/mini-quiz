"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";

type AdminQuiz = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  published: boolean;
  questionCount: number;
  headCount: number;
  playCount: number;
  avgScorePct: number;
  lastPlayedAt: string | null;
  createdAt: string;
};

export default function PracticeListPage() {
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.get<{ quizzes: AdminQuiz[] }>(
        "/admin/practice/quizzes",
      );
      setQuizzes(data.quizzes);
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

  const togglePublished = async (q: AdminQuiz) => {
    try {
      await adminApi.patch(`/admin/practice/quizzes/${q.id}`, {
        published: !q.published,
      });
      toast.success(
        q.published ? `"${q.title}" unpublished` : `"${q.title}" is live`,
      );
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      toast.error(msg);
    }
  };

  const remove = async (q: AdminQuiz) => {
    if (
      !confirm(
        `Delete "${q.title}"? All ${q.questionCount} questions and ${q.headCount} player histories will be removed.`,
      )
    )
      return;
    try {
      await adminApi.del(`/admin/practice/quizzes/${q.id}`);
      toast.success(`Deleted "${q.title}"`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error(msg);
    }
  };

  // Tabs: Active (published) default; Drafts (everything not yet published).
  // Both sub-lists sorted by total plays desc so the most-played quizzes
  // float to the top.
  const [tab, setTab] = useState<"active" | "drafts">("active");
  const filtered = quizzes.filter((q) =>
    tab === "active" ? q.published : !q.published,
  );
  filtered.sort((a, b) => b.playCount - a.playCount);

  const counts = {
    published: quizzes.filter((q) => q.published).length,
    drafts: quizzes.filter((q) => !q.published).length,
  };

  return (
    <>
      <TopBar title="Practice" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Practice" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>Practice</h1>
            <div className="adm-crumbs">
              {quizzes.length} total · {counts.published} published ·{" "}
              {counts.drafts} draft
            </div>
          </div>
          <div className="actions">
            <Link href="/practice/new" className="adm-btn adm-btn--primary">
              <AdminIcon name="plus" size={14} color="white" /> New quiz
            </Link>
          </div>
        </div>

        {error && (
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)", marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div
            className="adm-card-h"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <div className="adm-tabs" style={{ borderBottom: "none", margin: 0 }}>
              <button
                type="button"
                className={`adm-tab${tab === "active" ? " active" : ""}`}
                onClick={() => setTab("active")}
              >
                Active · {counts.published}
              </button>
              <button
                type="button"
                className={`adm-tab${tab === "drafts" ? " active" : ""}`}
                onClick={() => setTab("drafts")}
              >
                Drafts · {counts.drafts}
              </button>
            </div>
          </div>
          {loading && quizzes.length === 0 ? (
            <div style={{ padding: 18 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 18, color: "var(--a-ink-faint)" }}>
              {tab === "active"
                ? "No published practice quizzes yet."
                : "No drafts."}
            </div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Questions</th>
                  <th>Players</th>
                  <th>Plays</th>
                  <th>Avg score</th>
                  <th>Last played</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            flex: "0 0 32px",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: `var(--a-${q.coverColor}, var(--a-primary))`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {q.title.slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {q.title}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--a-ink-faint)",
                              fontFamily: "ui-monospace, monospace",
                            }}
                          >
                            /{q.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{q.questionCount}</td>
                    <td>{q.headCount}</td>
                    <td>{q.playCount}</td>
                    <td>
                      {q.playCount > 0 ? (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {q.avgScorePct}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--a-ink-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {q.lastPlayedAt ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--a-ink-soft)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                          title={q.lastPlayedAt}
                        >
                          {formatRelative(q.lastPlayedAt)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--a-ink-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.04,
                          textTransform: "uppercase",
                          background: q.published
                            ? "var(--a-primary-tint, #d1fae5)"
                            : "var(--a-bg)",
                          color: q.published
                            ? "var(--a-primary, #16a34a)"
                            : "var(--a-ink-faint)",
                          border: q.published
                            ? "1px solid var(--a-primary, #16a34a)"
                            : "1px solid var(--a-line)",
                        }}
                      >
                        {q.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Link
                          href={`/practice/${q.id}`}
                          className="adm-btn adm-btn--sm"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm"
                          onClick={() => void togglePublished(q)}
                        >
                          {q.published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm adm-btn--danger"
                          onClick={() => void remove(q)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// "5 minutes ago" / "2 days ago" — coarse but readable. Stat freshness
// matters more than exact timestamps in the admin list.
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 30 * 24 * 60 * 60_000)
    return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`;
  return new Date(iso).toLocaleDateString();
}
