"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminQuestion, AdminQuiz } from "@mini-quiz/shared";
import { TopBar } from "@/components/TopBar";
import { QuizStatusPill } from "@/components/StatusPill";
import { AdminIcon } from "@/components/AdminIcon";
import {
  QuizForm,
  fromAdminQuiz,
  type QuizFormValue,
} from "@/components/admin/QuizForm";
import { adminApi } from "@/lib/admin-api";

export default function EditQuizPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [initial, setInitial] = useState<QuizFormValue | null>(null);
  const [quiz, setQuiz] = useState<AdminQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.get<{
          quiz: AdminQuiz;
          questions: AdminQuestion[];
        }>(`/admin/quizzes/${params.id}`);
        if (cancelled) return;
        setQuiz(data.quiz);
        setInitial(fromAdminQuiz(data.quiz, data.questions));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const editable = quiz?.status === "DRAFT" || quiz?.status === "SCHEDULED";

  const archive = async () => {
    if (!quiz) return;
    if (!confirm(`Archive "${quiz.title}"? This is reversible only via DB.`))
      return;
    setArchiving(true);
    try {
      await adminApi.del(`/admin/quizzes/${params.id}`);
      router.push("/quizzes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
      setArchiving(false);
    }
  };

  return (
    <>
      <TopBar title={quiz?.title ?? "Game"} crumbs="Games" />
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
        {!quiz || !initial ? (
          <div style={{ color: "var(--a-ink-faint)" }}>Loading…</div>
        ) : (
          <>
            <div className="adm-page-h">
              <div>
                <div className="adm-crumbs">Games / {quiz.title}</div>
                <h1
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  {quiz.title} <QuizStatusPill status={quiz.status} />
                </h1>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--a-ink-soft)",
                    marginTop: 4,
                  }}
                >
                  Code <span style={{ fontFamily: "ui-monospace, monospace" }}>{quiz.code}</span>
                </div>
              </div>
              <div className="actions">
                <Link
                  href={`/quizzes/${quiz.id}/live`}
                  className="adm-btn"
                >
                  <AdminIcon name="eye" size={14} /> Live monitor
                </Link>
                <button
                  onClick={archive}
                  disabled={archiving}
                  className="adm-btn"
                  style={{ color: "var(--a-wrong)", borderColor: "var(--a-wrong-tint)" }}
                >
                  {archiving ? "Archiving…" : quiz.status === "DRAFT" ? "Delete draft" : "Archive"}
                </button>
              </div>
            </div>

            {editable ? (
              <QuizForm
                initial={initial}
                submitLabel="Save changes"
                onSubmit={async (v) => {
                  await adminApi.patch(`/admin/quizzes/${params.id}`, v);
                }}
              />
            ) : (
              <div className="adm-card">
                <div style={{ padding: 18 }}>
                  <p style={{ fontSize: 13, color: "var(--a-ink-soft)" }}>
                    This game is{" "}
                    <span style={{ fontWeight: 700 }}>{quiz.status}</span> and can no longer be edited. Create a new game if you need to change the questions.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
