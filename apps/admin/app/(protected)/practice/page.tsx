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
        {loading && quizzes.length === 0 ? (
          <div className="adm-card" style={{ padding: 18 }}>
            Loading…
          </div>
        ) : quizzes.length === 0 ? (
          <div
            className="adm-card"
            style={{ padding: 18, color: "var(--a-ink-faint)" }}
          >
            No practice quizzes yet. Create your first one.
          </div>
        ) : (
          <div className="adm-card" style={{ overflow: "hidden" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Questions</th>
                  <th>Players</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => (
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
          </div>
        )}
      </div>
    </>
  );
}
