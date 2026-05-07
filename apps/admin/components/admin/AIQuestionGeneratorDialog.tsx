"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";

export type AIChoice = { id: string; label: string };
export type AIQuestion = {
  prompt: string;
  choices: AIChoice[];
  correctChoiceId: string;
  explanation?: string;
};

type Props = {
  open: boolean;
  defaultCount?: number;
  defaultWithExplanations?: boolean;
  onCancel: () => void;
  onGenerated: (questions: AIQuestion[]) => void;
};

// Reusable modal that posts to /admin/ai/generate-questions and hands back
// the array of AI-generated questions to the parent. The parent decides
// what to do with them — for daily we drop them into the create-form's
// question editor; for practice we show a review screen and bulk-save.
export function AIQuestionGeneratorDialog({
  open,
  defaultCount = 10,
  defaultWithExplanations = true,
  onCancel,
  onGenerated,
}: Props) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [style, setStyle] = useState<"FACT" | "CONCEPTUAL" | "MIXED">("MIXED");
  const [count, setCount] = useState(defaultCount);
  const [language, setLanguage] = useState("English");
  const [withExplanations, setWithExplanations] = useState(defaultWithExplanations);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTopic("");
      setDifficulty("MEDIUM");
      setStyle("MIXED");
      setCount(defaultCount);
      setLanguage("English");
      setWithExplanations(defaultWithExplanations);
      setNotes("");
      setSubmitting(false);
      setError(null);
    }
  }, [open, defaultCount, defaultWithExplanations]);

  if (!open) return null;

  const submit = async () => {
    if (!topic.trim()) {
      setError("Topic is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.post<{ questions: AIQuestion[] }>(
        "/admin/ai/generate-questions",
        {
          topic: topic.trim(),
          count,
          difficulty,
          style,
          language,
          notes: notes.trim() || undefined,
          withExplanations,
        },
      );
      onGenerated(res.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 42, 68, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        className="adm-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 540, maxWidth: "calc(100vw - 32px)" }}
      >
        <div className="adm-card-h">
          <h3>Generate questions with AI</h3>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <div className="adm-field">
            <label>Topic</label>
            <input
              className="adm-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Celo basics, World capitals, JavaScript closures"
              disabled={submitting}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div className="adm-field">
              <label>Difficulty</label>
              <select
                className="adm-input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                disabled={submitting}
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div className="adm-field">
              <label>Style</label>
              <select
                className="adm-input"
                value={style}
                onChange={(e) => setStyle(e.target.value as typeof style)}
                disabled={submitting}
              >
                <option value="FACT">Fact recall</option>
                <option value="CONCEPTUAL">Conceptual</option>
                <option value="MIXED">Mixed</option>
              </select>
            </div>
            <div className="adm-field">
              <label>Count</label>
              <input
                className="adm-input"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="adm-field">
            <label>Language</label>
            <input
              className="adm-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={submitting}
            />
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
              checked={withExplanations}
              onChange={(e) => setWithExplanations(e.target.checked)}
              disabled={submitting}
            />
            Include explanation per question
          </label>
          <div className="adm-field">
            <label>Notes (optional)</label>
            <textarea
              className="adm-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything specific to focus on or avoid"
              disabled={submitting}
            />
          </div>
          {error && (
            <div
              style={{
                padding: 8,
                borderRadius: 8,
                background: "var(--a-danger-bg, #fde2e2)",
                color: "var(--a-danger, #b91c1c)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          {submitting && (
            <div style={{ fontSize: 12, color: "var(--a-ink-soft)" }}>
              Generating with Kimi… this can take 10–30 seconds.
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
            className="adm-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => void submit()}
            disabled={submitting || !topic.trim()}
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
