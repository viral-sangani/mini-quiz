"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
import {
  AIQuestionGeneratorDialog,
  type AIQuestion,
} from "@/components/admin/AIQuestionGeneratorDialog";

type Choice = { id: string; label: string };
type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string | null;
  createdAt: string;
};
type QuizDetail = {
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
  updatedAt: string;
  questions: Question[];
};

const CHOICE_IDS = ["a", "b", "c", "d"];

export default function PracticeQuizPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const [detail, setDetail] = useState<QuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [pending, setPending] = useState<AIQuestion[] | null>(null);
  const [savingPending, setSavingPending] = useState(false);

  // Local edits to quiz header
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    try {
      const data = await adminApi.get<QuizDetail>(
        `/admin/practice/quizzes/${id}`,
      );
      setDetail(data);
      setTitle(data.title);
      setDescription(data.description ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveHeader = async () => {
    try {
      await adminApi.patch(`/admin/practice/quizzes/${id}`, {
        title: title.trim(),
        description: description.trim() || null,
      });
      toast.success("Saved");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    }
  };

  // Practice quiz page already has its own title/description, so we only
  // need the questions array. The context arg is unused here but matches
  // the shared dialog signature.
  const onAIGenerated = (qs: AIQuestion[]) => {
    setAiOpen(false);
    setPending(qs);
  };

  const savePending = async () => {
    if (!pending) return;
    setSavingPending(true);
    try {
      // Normalize choice IDs to a/b/c/d.
      const normalized = pending.map((q) => {
        const remap = new Map<string, string>();
        const choices = q.choices.slice(0, 4).map((c, i) => {
          const cid = CHOICE_IDS[i]!;
          remap.set(c.id, cid);
          return { id: cid, label: c.label };
        });
        return {
          prompt: q.prompt,
          choices,
          correctChoiceId: remap.get(q.correctChoiceId) ?? "a",
          explanation: q.explanation ?? null,
        };
      });
      await adminApi.post(`/admin/practice/quizzes/${id}/questions`, {
        questions: normalized,
      });
      toast.success(`Added ${normalized.length} questions`);
      setPending(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingPending(false);
    }
  };

  const removeQuestion = async (qid: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await adminApi.del(`/admin/practice/questions/${qid}`);
      toast.success("Question deleted");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  if (error) {
    return (
      <>
        <TopBar title="Practice" />
        <div className="adm-content">
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)" }}>
            {error}
          </div>
        </div>
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <TopBar title="Practice" />
        <div className="adm-content">
          <div className="adm-card" style={{ padding: 18 }}>
            Loading…
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Practice" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Practice", href: "/practice" },
            { label: detail.title },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>{detail.title}</h1>
            <div className="adm-crumbs">
              /{detail.slug} · {detail.questionCount} questions ·{" "}
              {detail.headCount} players
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setAiOpen(true)}
            >
              <AdminIcon name="plus" size={14} color="white" /> Generate with AI
            </button>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-h">
            <h3>Quiz</h3>
            <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
              {detail.published ? "Published" : "Draft"}
            </span>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 10 }}>
            <div className="adm-field">
              <label>Title</label>
              <input
                className="adm-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="adm-field">
              <label>Description</label>
              <textarea
                className="adm-textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <button
                type="button"
                className="adm-btn"
                onClick={() => void saveHeader()}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>

        {pending && (
          <div className="adm-card" style={{ borderColor: "var(--a-primary)" }}>
            <div className="adm-card-h">
              <h3>Review {pending.length} AI-generated questions</h3>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              {pending.map((q, i) => (
                <div
                  key={i}
                  className="adm-card"
                  style={{ padding: 12 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Q{i + 1}: {q.prompt}
                  </div>
                  <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
                    {q.choices.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          color:
                            c.id === q.correctChoiceId
                              ? "var(--a-success, #16a34a)"
                              : "var(--a-ink-soft)",
                          fontWeight: c.id === q.correctChoiceId ? 700 : 400,
                        }}
                      >
                        {c.id.toUpperCase()}. {c.label}{" "}
                        {c.id === q.correctChoiceId ? "✓" : ""}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--a-ink-faint)",
                        fontStyle: "italic",
                      }}
                    >
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="adm-btn"
                  onClick={() => setPending(null)}
                  disabled={savingPending}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--primary"
                  onClick={() => void savePending()}
                  disabled={savingPending}
                >
                  {savingPending ? "Saving…" : `Save all ${pending.length}`}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="adm-card">
          <div className="adm-card-h">
            <h3>Questions ({detail.questions.length})</h3>
          </div>
          {detail.questions.length === 0 ? (
            <div style={{ padding: 18, color: "var(--a-ink-faint)" }}>
              No questions yet. Use &ldquo;Generate with AI&rdquo; to seed the pool.
            </div>
          ) : (
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              {detail.questions.map((q, i) => (
                <div
                  key={q.id}
                  className="adm-card"
                  style={{ padding: 14, boxShadow: "none" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        flex: "0 0 28px",
                        fontWeight: 800,
                        fontSize: 12,
                        color: "var(--a-ink-faint)",
                        marginTop: 2,
                      }}
                    >
                      Q{i + 1}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        fontWeight: 700,
                        fontSize: 14,
                        lineHeight: 1.4,
                      }}
                    >
                      {q.prompt}
                    </div>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm adm-btn--danger"
                      onClick={() => void removeQuestion(q.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginLeft: 38 }}>
                    {q.choices.map((c) => {
                      const isCorrect = c.id === q.correctChoiceId;
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: isCorrect
                              ? "var(--a-primary-tint, #d1fae5)"
                              : "var(--a-bg)",
                            border: isCorrect
                              ? "1px solid var(--a-primary, #16a34a)"
                              : "1px solid var(--a-line)",
                            fontSize: 13,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 800,
                              color: isCorrect
                                ? "var(--a-primary, #16a34a)"
                                : "var(--a-ink-faint)",
                              minWidth: 16,
                            }}
                          >
                            {c.id.toUpperCase()}.
                          </span>
                          <span style={{ flex: 1 }}>{c.label}</span>
                          {isCorrect && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "var(--a-primary, #16a34a)",
                                letterSpacing: 0.06,
                                textTransform: "uppercase",
                              }}
                            >
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div
                      style={{
                        marginLeft: 38,
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "var(--a-bg)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--a-ink-soft)",
                        fontStyle: "italic",
                        borderLeft: "3px solid var(--a-line)",
                      }}
                    >
                      <strong style={{ fontStyle: "normal", color: "var(--a-ink)" }}>
                        Why:
                      </strong>{" "}
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <AIQuestionGeneratorDialog
          open={aiOpen}
          defaultCount={10}
          defaultWithExplanations={true}
          onCancel={() => setAiOpen(false)}
          onGenerated={onAIGenerated}
        />
      </div>
    </>
  );
}
