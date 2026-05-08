"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
import {
  AIQuestionGeneratorDialog,
  type AIGenerationContext,
  type AIQuestion,
} from "@/components/admin/AIQuestionGeneratorDialog";

const CHOICE_IDS = ["a", "b", "c", "d"] as const;

export default function PracticeNewPage() {
  const router = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverColor, setCoverColor] = useState("primary");
  const [published, setPublished] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-suggest a slug from the title as the admin types, but only as long
  // as the slug field hasn't been hand-edited. Saves the most common copy
  // step on this form.
  const [slugTouched, setSlugTouched] = useState(false);
  const setTitleAndMaybeSlug = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      const auto = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      setSlug(auto);
    }
  };
  const onTitleChange = (val: string) => {
    setTitleAndMaybeSlug(val);
  };

  const onAIGenerated = (incoming: AIQuestion[], ctx: AIGenerationContext) => {
    const normalized = incoming.map((q) => {
      const remap = new Map<string, string>();
      const choices = q.choices.slice(0, 4).map((c, i) => {
        const id = CHOICE_IDS[i]!;
        remap.set(c.id, id);
        return { id, label: c.label };
      });
      while (choices.length < 4) {
        const id = CHOICE_IDS[choices.length]!;
        choices.push({ id, label: "" });
      }
      return {
        prompt: q.prompt,
        choices,
        correctChoiceId: remap.get(q.correctChoiceId) ?? choices[0]?.id ?? "a",
        explanation: q.explanation,
      };
    });
    setQuestions(normalized);
    if (!title.trim()) {
      setTitleAndMaybeSlug(ctx.topic.charAt(0).toUpperCase() + ctx.topic.slice(1));
    }
    if (!description.trim()) {
      setDescription(`${ctx.count} ${ctx.difficulty.toLowerCase()} questions on ${ctx.topic}.`);
    }
    setAiOpen(false);
  };

  const updateQuestion = (idx: number, patch: Partial<AIQuestion>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateChoice = (qIdx: number, cIdx: number, label: string) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              choices: q.choices.map((c, j) => (j === cIdx ? { ...c, label } : c)),
            }
          : q,
      ),
    );
  };

  const submit = async () => {
    setError(null);
    if (!slug.trim()) return setError("Slug is required");
    if (!title.trim()) return setError("Title is required");
    if (published && questions.length < 10) {
      return setError("Publishing needs at least 10 AI-generated questions");
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      if (!q.prompt.trim()) return setError(`Question ${i + 1}: prompt is required`);
      for (const c of q.choices) {
        if (!c.label.trim()) return setError(`Question ${i + 1}: choice ${c.id} is empty`);
      }
      if (!q.choices.find((c) => c.id === q.correctChoiceId)) {
        return setError(`Question ${i + 1}: correct answer not selected`);
      }
    }
    setSubmitting(true);
    try {
      const res = await adminApi.post<{ quiz: { id: string } }>(
        "/admin/practice/quizzes",
        {
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim() || null,
          coverColor,
          published: false,
        },
      );
      if (questions.length > 0) {
        await adminApi.post(`/admin/practice/quizzes/${res.quiz.id}/questions`, {
          questions: questions.map((q) => ({
            prompt: q.prompt.trim(),
            choices: q.choices.map((c) => ({ id: c.id, label: c.label.trim() })),
            correctChoiceId: q.correctChoiceId,
            explanation: q.explanation?.trim() || null,
          })),
        });
      }
      if (published) {
        await adminApi.patch(`/admin/practice/quizzes/${res.quiz.id}`, {
          published: true,
        });
      }
      toast.success(`Created "${title.trim()}"`);
      router.push(`/practice/${res.quiz.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopBar title="Practice" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Practice", href: "/practice" },
            { label: "New" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>New practice quiz</h1>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 540px) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <div className="adm-card">
            <div className="adm-card-h">
              <h3>Quiz details</h3>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              <div className="adm-field">
                <label>Title</label>
                <input
                  className="adm-input"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Celo basics"
                  disabled={submitting}
                />
              </div>
              <div className="adm-field">
                <label>Slug</label>
                <input
                  className="adm-input"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="celo-basics"
                  disabled={submitting}
                />
                <span style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                  URL handle. Lowercase letters, numbers, hyphens.
                </span>
              </div>
              <div className="adm-field">
                <label>Description</label>
                <textarea
                  className="adm-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={submitting}
                />
              </div>
              <div className="adm-field">
                <label>Cover color</label>
                <select
                  className="adm-input"
                  value={coverColor}
                  onChange={(e) => setCoverColor(e.target.value)}
                  disabled={submitting}
                >
                  <option value="primary">Primary</option>
                  <option value="berry">Berry</option>
                  <option value="sky">Sky</option>
                  <option value="accent">Accent</option>
                  <option value="ink">Ink</option>
                </select>
              </div>
              <div>
                <button
                  type="button"
                  className="adm-btn"
                  onClick={() => setAiOpen(true)}
                  disabled={submitting}
                >
                  Generate with AI
                </button>
                <span style={{ fontSize: 12, color: "var(--a-ink-faint)", marginLeft: 8 }}>
                  Type a topic or choose one with AI before creating.
                </span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  disabled={submitting}
                />
                Publish immediately (needs at least 10 questions)
              </label>
              {error && (
                <div style={{ color: "var(--a-danger, #b91c1c)", fontSize: 12, fontWeight: 600 }}>
                  {error}
                </div>
              )}
            </div>
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--a-line)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="adm-btn adm-btn--primary"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? "Creating…" : "Create quiz"}
              </button>
            </div>
          </div>
          <div className="adm-card" style={{ alignSelf: "start" }}>
            <div className="adm-card-h">
              <h3>AI questions ({questions.length})</h3>
              {questions.length > 0 && (
                <button
                  type="button"
                  className="adm-btn adm-btn--sm adm-btn--ghost"
                  onClick={() => setQuestions([])}
                  disabled={submitting}
                >
                  Clear
                </button>
              )}
            </div>
            {questions.length === 0 ? (
              <div style={{ padding: 18, color: "var(--a-ink-faint)", fontSize: 13 }}>
                Generate questions now, or create a draft and add questions later.
              </div>
            ) : (
              <div style={{ padding: 18, display: "grid", gap: 12, maxHeight: "70vh", overflow: "auto" }}>
                {questions.map((q, qi) => (
                  <div
                    key={qi}
                    style={{
                      border: "1px solid var(--a-line)",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                  <div className="adm-field">
                    <label>Question {qi + 1}</label>
                    <textarea
                      className="adm-textarea"
                      rows={2}
                      value={q.prompt}
                      onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {q.choices.map((c, ci) => (
                      <label
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 44,
                        }}
                      >
                        <input
                          type="radio"
                          name={`practice-new-q-${qi}`}
                          checked={q.correctChoiceId === c.id}
                          onChange={() => updateQuestion(qi, { correctChoiceId: c.id })}
                          disabled={submitting}
                        />
                        <span
                          style={{
                            width: 16,
                            color: "var(--a-ink-faint)",
                            fontSize: 12,
                            fontWeight: 800,
                            textTransform: "uppercase",
                          }}
                        >
                          {c.id}
                        </span>
                        <input
                          className="adm-input"
                          style={{ flex: 1 }}
                          value={c.label}
                          onChange={(e) => updateChoice(qi, ci, e.target.value)}
                          disabled={submitting}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="adm-field" style={{ marginTop: 10 }}>
                    <label>Explanation</label>
                    <textarea
                      className="adm-textarea"
                      rows={2}
                      value={q.explanation ?? ""}
                      onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <AIQuestionGeneratorDialog
        open={aiOpen}
        mode="practice"
        defaultCount={10}
        defaultWithExplanations={true}
        onCancel={() => setAiOpen(false)}
        onGenerated={onAIGenerated}
      />
    </>
  );
}
