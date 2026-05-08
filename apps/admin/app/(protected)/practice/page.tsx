"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";

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
  createdAt: string;
};

export default function PracticeListPage() {
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const counts = {
    published: quizzes.filter((q) => q.published).length,
    drafts: quizzes.filter((q) => !q.published).length,
  };

  return (
    <>
      <TopBar title="Practice" />
      <div className="adm-content">
        <div className="adm-page-h">
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {loading && quizzes.length === 0 ? (
            <div className="adm-card" style={{ padding: 18 }}>
              Loading…
            </div>
          ) : quizzes.length === 0 ? (
            <div className="adm-card" style={{ padding: 18, color: "var(--a-ink-faint)" }}>
              No practice quizzes yet. Create your first one.
            </div>
          ) : (
            quizzes.map((q) => (
              <div key={q.id} className="adm-card" style={{ padding: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `var(--a-${q.coverColor}, var(--a-primary))`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 800,
                    }}
                  >
                    {q.title.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{q.title}</div>
                    <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                      /{q.slug}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 12,
                    color: "var(--a-ink-soft)",
                    marginBottom: 12,
                  }}
                >
                  <span>{q.questionCount} questions</span>
                  <span>{q.headCount} players</span>
                  <span style={{ color: q.published ? "var(--a-success, #16a34a)" : "var(--a-ink-faint)", fontWeight: 700 }}>
                    {q.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
