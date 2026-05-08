"use client";

import { useEffect, useState } from "react";
import type {
  AdminQuestion,
  AdminQuiz,
  CoverColor,
  Difficulty,
  PayoutTokenSymbol,
} from "@mini-quiz/shared";
import { COVER_COLORS } from "@mini-quiz/shared";
import { isoUtcToLocalDatetimeInput, localDatetimeInputToIsoUtc } from "@/lib/time";
import { AdminIcon } from "@/components/AdminIcon";
import { adminApi } from "@/lib/admin-api";
import { DepositPanel } from "./DepositPanel";

export type QuizFormValue = {
  title: string;
  description: string;
  scheduledStartLocal: string;
  questionTimeMs: number;
  prizeAmounts: string[];
  difficulty: Difficulty;
  coverColor: CoverColor;
  payoutToken: PayoutTokenSymbol;
  questions: {
    prompt: string;
    choices: { id: string; label: string }[];
    correctChoiceId: string;
  }[];
};

export type QuizFormSubmit = {
  title: string;
  description: string | null;
  scheduledStart: string | null;
  questionTimeMs: number;
  prizeAmounts: string[];
  difficulty: Difficulty;
  coverColor: CoverColor;
  payoutToken: PayoutTokenSymbol;
  questions: QuizFormValue["questions"];
};

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

function defaultValue(): QuizFormValue {
  return {
    title: "",
    description: "",
    scheduledStartLocal: "",
    questionTimeMs: 15_000,
    prizeAmounts: ["50", "25", "15", "5", "5", "5", "5", "5", "5", "5"],
    difficulty: "MEDIUM",
    coverColor: "primary",
    payoutToken: "USDT",
    questions: [blankQuestion()],
  };
}

function blankQuestion() {
  return {
    prompt: "",
    choices: [
      { id: "a", label: "" },
      { id: "b", label: "" },
      { id: "c", label: "" },
      { id: "d", label: "" },
    ],
    correctChoiceId: "a",
  };
}

export function fromAdminQuiz(
  quiz: AdminQuiz,
  questions: AdminQuestion[],
): QuizFormValue {
  return {
    title: quiz.title,
    description: quiz.description ?? "",
    scheduledStartLocal: quiz.scheduledStart
      ? isoUtcToLocalDatetimeInput(quiz.scheduledStart)
      : "",
    questionTimeMs: quiz.questionTimeMs,
    prizeAmounts: quiz.prizeAmounts,
    difficulty: quiz.difficulty,
    coverColor: (quiz.coverColor as CoverColor) ?? "primary",
    payoutToken: ((quiz as unknown as { payoutToken?: PayoutTokenSymbol })
      .payoutToken ?? "USDT"),
    questions: questions.map((q) => ({
      prompt: q.prompt,
      choices: q.choices,
      correctChoiceId: q.correctChoiceId,
    })),
  };
}

const COVER_VAR: Record<CoverColor, string> = {
  primary: "var(--a-primary)",
  berry: "var(--a-berry)",
  sky: "var(--a-sky)",
  accent: "var(--a-accent)",
  ink: "var(--a-ink)",
};

export function QuizForm({
  initial,
  submitLabel = "Save",
  onSubmit,
}: {
  initial?: QuizFormValue;
  submitLabel?: string;
  onSubmit: (v: QuizFormSubmit) => Promise<void>;
}) {
  const [v, setV] = useState<QuizFormValue>(initial ?? defaultValue());
  const [tab, setTab] = useState<"basics" | "questions" | "prizes" | "review">(
    "basics",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<QuizFormValue>) => setV((prev) => ({ ...prev, ...p }));

  const update = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: v.title.trim(),
        description: v.description.trim() || null,
        scheduledStart: v.scheduledStartLocal
          ? localDatetimeInputToIsoUtc(v.scheduledStartLocal)
          : null,
        questionTimeMs: v.questionTimeMs,
        prizeAmounts: v.prizeAmounts.map((s) => s.trim()).filter(Boolean),
        difficulty: v.difficulty,
        coverColor: v.coverColor,
        payoutToken: v.payoutToken,
        questions: v.questions.map((q) => ({
          prompt: q.prompt.trim(),
          choices: q.choices.map((c) => ({ id: c.id, label: c.label.trim() })),
          correctChoiceId: q.correctChoiceId,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPool = v.prizeAmounts
    .map((a) => Number(a))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);

  // Treasury balance gate. Whenever the picked token or the total pool
  // changes, re-check available funds. We rely on the server cache (30s)
  // for the heavy lifting; the polling done by <DepositPanel /> will
  // unlock the form once a deposit lands.
  type Treasury = {
    address: string;
    available: Record<PayoutTokenSymbol, string>;
  };
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await adminApi.get<Treasury>("/admin/treasury");
        if (!cancelled) setTreasury(data);
      } catch {
        // Not fatal — server-side balance check at submit will catch it.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when the picked token changes; the polling loop in
    // DepositPanel handles the steady-state refresh.
  }, [v.payoutToken]);
  const availableForToken = treasury
    ? Number(treasury.available[v.payoutToken] ?? "0")
    : null;
  const treasurySufficient =
    availableForToken == null || availableForToken >= totalPool;

  return (
    <>
      <div className="adm-tabs">
        {(["basics", "questions", "prizes", "review"] as const).map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`adm-tab${tab === id ? " active" : ""}`}
          >
            {i + 1}. {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={update}
          disabled={submitting}
          className="adm-btn adm-btn--primary"
          style={{ marginBottom: 8 }}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>

      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--a-wrong-tint)", color: "var(--a-wrong)", marginBottom: 12 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {tab === "basics" && (
            <>
              <div className="adm-card">
                <div className="adm-card-h">
                  <h3>Basics</h3>
                </div>
                <div
                  style={{
                    padding: 18,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div className="adm-field" style={{ gridColumn: "1/-1" }}>
                    <label>Game title</label>
                    <input
                      className="adm-input"
                      value={v.title}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </div>
                  <div className="adm-field" style={{ gridColumn: "1/-1" }}>
                    <label>Description (optional)</label>
                    <textarea
                      className="adm-textarea"
                      rows={2}
                      value={v.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </div>
                  <div className="adm-field">
                    <label>Difficulty</label>
                    <select
                      className="adm-select"
                      value={v.difficulty}
                      onChange={(e) =>
                        patch({ difficulty: e.target.value as Difficulty })
                      }
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {d.charAt(0) + d.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-field">
                    <label>Time per question</label>
                    <select
                      className="adm-select"
                      value={v.questionTimeMs}
                      onChange={(e) =>
                        patch({ questionTimeMs: Number(e.target.value) })
                      }
                    >
                      {[10_000, 15_000, 20_000, 30_000, 45_000, 60_000].map((ms) => (
                        <option key={ms} value={ms}>
                          {ms / 1000}s
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-field" style={{ gridColumn: "1/-1" }}>
                    <label>Cover color</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {COVER_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => patch({ coverColor: c })}
                          aria-label={c}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: COVER_VAR[c],
                            border:
                              v.coverColor === c
                                ? "3px solid var(--a-ink)"
                                : "1px solid var(--a-line)",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="adm-card">
                <div className="adm-card-h">
                  <h3>Schedule</h3>
                </div>
                <div
                  style={{
                    padding: 18,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div className="adm-field" style={{ gridColumn: "1/-1" }}>
                    <label>Start (local — stored as UTC)</label>
                    <input
                      type="datetime-local"
                      className="adm-input"
                      value={v.scheduledStartLocal}
                      onChange={(e) => patch({ scheduledStartLocal: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "questions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="flex items-center justify-between">
                <div className="adm-h3">Questions ({v.questions.length})</div>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm"
                  onClick={() =>
                    patch({ questions: [...v.questions, blankQuestion()] })
                  }
                >
                  <AdminIcon name="plus" size={12} /> Add question
                </button>
              </div>

              {v.questions.map((q, qi) => (
                <div key={qi} className="adm-card">
                  <div className="adm-card-h">
                    <h3>Q{qi + 1}</h3>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm adm-btn--ghost"
                      style={{ color: "var(--a-wrong)" }}
                      disabled={v.questions.length <= 1}
                      onClick={() =>
                        patch({
                          questions: v.questions.filter((_, i) => i !== qi),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <textarea
                      className="adm-textarea"
                      rows={2}
                      placeholder="Prompt"
                      value={q.prompt}
                      onChange={(e) => {
                        const next = [...v.questions];
                        next[qi] = { ...q, prompt: e.target.value };
                        patch({ questions: next });
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {q.choices.map((c, ci) => (
                        <label
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            border: "1px solid var(--a-line)",
                            background: "var(--a-bg)",
                            borderRadius: 8,
                            padding: "8px 12px",
                          }}
                        >
                          <input
                            type="radio"
                            name={`q-${qi}-correct`}
                            checked={q.correctChoiceId === c.id}
                            onChange={() => {
                              const next = [...v.questions];
                              next[qi] = { ...q, correctChoiceId: c.id };
                              patch({ questions: next });
                            }}
                          />
                          <span
                            style={{
                              width: 20,
                              fontSize: 12,
                              fontWeight: 800,
                              color: "var(--a-ink-soft)",
                              textTransform: "uppercase",
                            }}
                          >
                            {String.fromCharCode(65 + ci)}
                          </span>
                          <input
                            className="adm-input"
                            style={{ flex: 1, height: 32 }}
                            value={c.label}
                            onChange={(e) => {
                              const next = [...v.questions];
                              const nextChoices = [...q.choices];
                              nextChoices[ci] = { ...c, label: e.target.value };
                              next[qi] = { ...q, choices: nextChoices };
                              patch({ questions: next });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "prizes" && (
            <>
            <div className="adm-card">
              <div className="adm-card-h">
                <h3>Prize pool ({v.payoutToken})</h3>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--a-ink-soft)" }}>
                  Total: {Number(totalPool.toFixed(6))} {v.payoutToken}
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <p style={{ fontSize: 12, color: "var(--a-ink-faint)", marginBottom: 12 }}>
                  Top-N prizes — position 1 is 1st place. Auto-paid when the game ends.
                </p>
                {/* Token picker. Choosing CELO vs a stablecoin re-runs the
                  * treasury balance check below. */}
                <div className="adm-field" style={{ marginBottom: 14 }}>
                  <label>Payout token</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["CELO", "USDC", "USDT"] as const).map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => patch({ payoutToken: sym })}
                        className={`adm-btn adm-btn--sm${v.payoutToken === sym ? " adm-btn--primary" : ""}`}
                        style={{ minWidth: 64 }}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: treasurySufficient
                        ? "var(--a-primary, #16a34a)"
                        : "var(--a-wrong, #b91c1c)",
                      fontWeight: 700,
                      marginTop: 6,
                      display: "inline-block",
                    }}
                  >
                    {availableForToken == null
                      ? "Checking treasury balance…"
                      : treasurySufficient
                        ? `✓ Treasury has ${availableForToken} ${v.payoutToken} available`
                        : `⚠ Need ${(totalPool - availableForToken).toFixed(v.payoutToken === "CELO" ? 4 : 2)} more ${v.payoutToken} — see deposit panel below`}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 8,
                  }}
                >
                  {v.prizeAmounts.map((val, idx) => (
                    <div key={idx} className="adm-field">
                      <label>#{idx + 1}</label>
                      <input
                        className="adm-input"
                        inputMode="decimal"
                        value={val}
                        onChange={(e) => {
                          const next = [...v.prizeAmounts];
                          next[idx] = e.target.value;
                          patch({ prizeAmounts: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm"
                    onClick={() =>
                      patch({ prizeAmounts: [...v.prizeAmounts, "0"] })
                    }
                  >
                    + Add rank
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm"
                    disabled={v.prizeAmounts.length <= 1}
                    onClick={() =>
                      patch({ prizeAmounts: v.prizeAmounts.slice(0, -1) })
                    }
                  >
                    − Remove last
                  </button>
                </div>
              </div>
            </div>
            {!treasurySufficient && treasury && totalPool > 0 && (
              <DepositPanel
                token={v.payoutToken}
                required={totalPool}
                treasuryAddress={treasury.address}
                onSatisfied={() => {
                  // Re-fetch the available figure so the inline status
                  // flips to ✓ — DepositPanel itself stops polling.
                  void adminApi
                    .get<Treasury>("/admin/treasury")
                    .then((d) => setTreasury(d))
                    .catch(() => {});
                }}
              />
            )}
            </>
          )}

          {tab === "review" && (
            <div className="adm-card">
              <div className="adm-card-h">
                <h3>Review</h3>
              </div>
              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                <ReviewRow label="Title" value={v.title || "—"} />
                <ReviewRow label="Difficulty" value={v.difficulty} />
                <ReviewRow label="Cover color" value={v.coverColor} />
                <ReviewRow
                  label="Schedule"
                  value={v.scheduledStartLocal || "—"}
                />
                <ReviewRow
                  label="Time per question"
                  value={`${v.questionTimeMs / 1000}s`}
                />
                <ReviewRow label="Questions" value={String(v.questions.length)} />
                <ReviewRow
                  label="Pool ranks"
                  value={`${v.prizeAmounts.length} (total $${Number(totalPool.toFixed(6))})`}
                />
              </div>
            </div>
          )}
        </div>

        <PreviewCard v={v} totalPool={totalPool} />
      </div>
    </>
  );
}

function PreviewCard({
  v,
  totalPool,
}: {
  v: QuizFormValue;
  totalPool: number;
}) {
  const cover = COVER_VAR[v.coverColor];
  return (
    <div className="adm-card" style={{ alignSelf: "flex-start", position: "sticky", top: 16 }}>
      <div className="adm-card-h">
        <h3>Player preview</h3>
      </div>
      <div style={{ padding: 18 }}>
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            position: "relative",
            background: `linear-gradient(135deg, ${cover}, var(--a-accent))`,
            padding: 14,
            color: "white",
            minHeight: 130,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.1,
              background: "rgba(255,255,255,0.25)",
              padding: "3px 8px",
              borderRadius: 999,
              marginBottom: 8,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 5, background: "white" }} />
            {v.scheduledStartLocal ? "SCHEDULED" : "DRAFT"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 18,
              marginBottom: 2,
            }}
          >
            {v.title || "Untitled game"}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, marginBottom: 10 }}>
            {v.questions.length} questions · {v.difficulty.charAt(0) + v.difficulty.slice(1).toLowerCase()} · ${Number(totalPool.toFixed(6))} pool
          </div>
          <div
            style={{
              display: "inline-block",
              background: "white",
              color: cover,
              padding: "6px 12px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            JOIN
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--a-primary-tint)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--a-primary)",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AdminIcon name="check" size={14} color="var(--a-primary)" />
          Auto-payouts on game end. No approval needed.
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--a-ink-faint)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
