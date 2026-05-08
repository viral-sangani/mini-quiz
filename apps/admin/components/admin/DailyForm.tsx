"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { AdminIcon } from "@/components/AdminIcon";
import { useToast } from "@/components/Toast";
import {
  AIQuestionGeneratorDialog,
  type AIGenerationContext,
  type AIQuestion,
} from "./AIQuestionGeneratorDialog";

export type DailyQuestion = {
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
};

const CHOICE_IDS = ["a", "b", "c", "d"] as const;

function blankQuestion(): DailyQuestion {
  return {
    prompt: "",
    choices: CHOICE_IDS.map((id) => ({ id, label: "" })),
    correctChoiceId: "a",
  };
}

export function DailyForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: {
    id?: string;
    title?: string;
    description?: string | null;
    date?: string | null;
    status?: string;
    questions?: DailyQuestion[];
  };
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(
    initial?.date ?? new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("date") ?? "",
  );
  const [questions, setQuestions] = useState<DailyQuestion[]>(
    initial?.questions && initial.questions.length === 10
      ? initial.questions
      : Array.from({ length: 10 }, blankQuestion),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const toast = useToast();

  const lockedToEdit = mode === "edit" && initial?.status && initial.status !== "DRAFT" && initial.status !== "SCHEDULED";

  // If we land here without a date in create mode, default to today UTC.
  useEffect(() => {
    if (mode === "create" && !date) {
      const now = new Date();
      setDate(
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`,
      );
    }
  }, [mode, date]);

  const updateQuestion = (idx: number, patch: Partial<DailyQuestion>) => {
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

  const onAIGenerated = (incoming: AIQuestion[], ctx: AIGenerationContext) => {
    setAiOpen(false);
    // Take up to 10, normalize choice IDs to a/b/c/d so they line up with our
    // schema. AI may return 'a','b','c','d' already, but normalize defensively.
    const normalized: DailyQuestion[] = incoming.slice(0, 10).map((q) => {
      const remap = new Map<string, string>();
      const choices = q.choices.slice(0, 4).map((c, i) => {
        const id = CHOICE_IDS[i]!;
        remap.set(c.id, id);
        return { id, label: c.label };
      });
      const correctChoiceId = remap.get(q.correctChoiceId) ?? choices[0]?.id ?? "a";
      return { prompt: q.prompt, choices, correctChoiceId };
    });
    // Pad with blanks if fewer than 10 returned.
    while (normalized.length < 10) normalized.push(blankQuestion());
    setQuestions(normalized);
    // Default-fill title + description from the AI topic if admin left them
    // blank — saves a copy/paste step. If they already typed something, leave
    // it. Mirror the formatting of the topic for the title (capitalize first
    // letter), keep description short.
    const topicTitle =
      ctx.topic.charAt(0).toUpperCase() + ctx.topic.slice(1);
    if (!title.trim()) setTitle(topicTitle);
    if (!description.trim()) {
      setDescription(`${ctx.count} ${ctx.difficulty.toLowerCase()} questions on ${ctx.topic}.`);
    }
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError("Title is required");
    if (!date) return setError("Date is required");
    for (let i = 0; i < 10; i++) {
      const q = questions[i]!;
      if (!q.prompt.trim()) return setError(`Question ${i + 1}: prompt is required`);
      for (let c = 0; c < q.choices.length; c++) {
        if (!q.choices[c]!.label.trim()) {
          return setError(`Question ${i + 1}: choice ${q.choices[c]!.id} is empty`);
        }
      }
      if (!q.choices.find((c) => c.id === q.correctChoiceId)) {
        return setError(`Question ${i + 1}: correct answer not selected`);
      }
    }
    setSubmitting(true);
    try {
      if (mode === "create") {
        await adminApi.post<{ id: string }>("/admin/daily", {
          date,
          title: title.trim(),
          description: description.trim() || null,
          questions,
        });
      } else if (initial?.id) {
        await adminApi.patch(`/admin/daily/${initial.id}`, {
          title: title.trim(),
          description: description.trim() || null,
          questions,
        });
      }
      toast.success(mode === "create" ? "Daily quiz created" : "Daily quiz saved");
      window.location.href = "/daily";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="adm-card">
        <div className="adm-card-h">
          <h3>Details</h3>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <div className="adm-field">
            <label>UTC date</label>
            <input
              type="date"
              className="adm-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={mode === "edit" || submitting}
            />
          </div>
          <div className="adm-field">
            <label>Title</label>
            <input
              className="adm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting || !!lockedToEdit}
              placeholder="e.g. Tuesday trivia"
            />
          </div>
          <div className="adm-field">
            <label>Description (optional)</label>
            <textarea
              className="adm-textarea"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={submitting || !!lockedToEdit}
            />
          </div>
          <div>
            <button
              type="button"
              className="adm-btn"
              onClick={() => setAiOpen(true)}
              disabled={submitting || !!lockedToEdit}
            >
              <AdminIcon name="bell" size={14} color="currentColor" /> Generate 10 with AI
            </button>
            <span style={{ fontSize: 12, color: "var(--a-ink-faint)", marginLeft: 8 }}>
              Replaces all questions below.
            </span>
          </div>
        </div>
      </div>

      {questions.map((q, qi) => (
        <div key={qi} className="adm-card">
          <div className="adm-card-h">
            <h3>Question {qi + 1}</h3>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 10 }}>
            <div className="adm-field">
              <label>Prompt</label>
              <textarea
                className="adm-textarea"
                value={q.prompt}
                onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                rows={2}
                disabled={submitting || !!lockedToEdit}
              />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {q.choices.map((c, ci) => (
                <div
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <input
                    type="radio"
                    name={`q-${qi}-correct`}
                    checked={q.correctChoiceId === c.id}
                    onChange={() => updateQuestion(qi, { correctChoiceId: c.id })}
                    disabled={submitting || !!lockedToEdit}
                    style={{ flex: "0 0 auto" }}
                  />
                  <span
                    style={{
                      width: 16,
                      flex: "0 0 16px",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "var(--a-ink-faint)",
                      textAlign: "center",
                    }}
                  >
                    {c.id.toUpperCase()}
                  </span>
                  <input
                    className="adm-input"
                    style={{ flex: 1 }}
                    value={c.label}
                    onChange={(e) => updateChoice(qi, ci, e.target.value)}
                    disabled={submitting || !!lockedToEdit}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {error && (
        <div
          className="adm-card"
          style={{ padding: 12, color: "var(--a-danger, #b91c1c)" }}
        >
          {error}
        </div>
      )}
      {lockedToEdit && (
        <div className="adm-card" style={{ padding: 12, color: "var(--a-ink-soft)" }}>
          This daily has already started. Editing is locked.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          onClick={() => void submit()}
          disabled={submitting || !!lockedToEdit}
        >
          {submitting ? "Saving…" : mode === "create" ? "Create daily" : "Save changes"}
        </button>
      </div>

      <AIQuestionGeneratorDialog
        open={aiOpen}
        mode="daily"
        defaultCount={10}
        defaultWithExplanations={false}
        onCancel={() => setAiOpen(false)}
        onGenerated={onAIGenerated}
      />
    </div>
  );
}
