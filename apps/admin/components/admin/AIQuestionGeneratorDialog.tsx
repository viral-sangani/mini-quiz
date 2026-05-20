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
export type AIMode = "live" | "daily" | "practice";
export type AISuggestedTopic = {
  title: string;
  description: string;
};

// Context attached to the AI generation result so the parent can default
// other fields (title, description) from the topic the admin typed.
export type AIGenerationContext = {
  topic: string;
  count: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  withExplanations: boolean;
};

type Props = {
  open: boolean;
  mode: AIMode;
  defaultCount?: number;
  defaultWithExplanations?: boolean;
  onCancel: () => void;
  onGenerated: (questions: AIQuestion[], context: AIGenerationContext) => void;
};

// Reusable modal that posts to /admin/ai/generate-questions and hands back
// the array of AI-generated questions to the parent. The parent decides
// what to do with them — for daily we drop them into the create-form's
// question editor; for practice we show a review screen and bulk-save.
export function AIQuestionGeneratorDialog({
  open,
  mode,
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
  const [topics, setTopics] = useState<AISuggestedTopic[]>([]);
  const [suggesting, setSuggesting] = useState(false);
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
      setTopics([]);
      setSuggesting(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open, defaultCount, defaultWithExplanations]);

  if (!open) return null;

  const suggest = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const res = await adminApi.post<{ topics: AISuggestedTopic[] }>(
        "/admin/ai/suggest-topics",
        {
          mode,
          count: 6,
          seed: topic.trim() || undefined,
        },
      );
      setTopics(res.topics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Topic suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

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
      onGenerated(res.questions, {
        topic: topic.trim(),
        count,
        difficulty,
        withExplanations,
      });
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
        padding: 16,
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        className="adm-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="adm-card-h" style={{ flex: "0 0 auto" }}>
          <h3>Generate quiz draft with AI</h3>
        </div>
        <div
          style={{
            padding: 18,
            display: "grid",
            gap: 12,
            overflowY: "auto",
            overscrollBehavior: "contain",
            minHeight: 0,
          }}
        >
          <div className="adm-field">
            <label>Topic</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="adm-input"
                style={{ flex: 1 }}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Celo basics, World capitals, JavaScript closures"
                disabled={submitting || suggesting}
              />
              <button
                type="button"
                className="adm-btn adm-btn--ai"
                onClick={() => void suggest()}
                disabled={submitting || suggesting}
                style={{ minWidth: 124 }}
              >
                {suggesting ? "Suggesting..." : "Suggest topics"}
              </button>
            </div>
            <span style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
              Type a topic, or type a theme first and ask AI for topic options.
            </span>
          </div>
          {topics.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: 8,
                border: "1px solid var(--a-line)",
                background: "var(--a-bg)",
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--a-ink-soft)",
                  letterSpacing: "0.02em",
                }}
              >
                Suggested topics
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {topics.map((t) => (
                  <button
                    key={`${t.title}-${t.description}`}
                    type="button"
                    className="adm-chip"
                    onClick={() => setTopic(t.title)}
                    disabled={submitting || suggesting}
                    style={{
                      height: "auto",
                      minHeight: 44,
                      textAlign: "left",
                      display: "block",
                      whiteSpace: "normal",
                      lineHeight: 1.35,
                      padding: "8px 10px",
                    }}
                  >
                    <span style={{ display: "block", color: "var(--a-ink)", fontWeight: 800 }}>
                      {t.title}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "var(--a-ink-soft)",
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {t.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
            flex: "0 0 auto",
            background: "white",
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
            className="adm-btn adm-btn--ai"
            onClick={() => void submit()}
            disabled={submitting || suggesting || !topic.trim()}
          >
              {submitting ? "Generating…" : "Generate draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
