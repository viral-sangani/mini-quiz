"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminQuestion,
  AdminQuiz,
  CoverColor,
  Difficulty,
  PayoutTokenSymbol,
} from "@mini-quiz/shared";
import { COVER_COLORS, getPayoutToken } from "@mini-quiz/shared";
import { isoUtcToLocalDatetimeInput, localDatetimeInputToIsoUtc } from "@/lib/time";
import { AdminIcon } from "@/components/AdminIcon";
import { adminApi } from "@/lib/admin-api";
import { DepositPanel } from "./DepositPanel";
import {
  AIQuestionGeneratorDialog,
  type AIGenerationContext,
  type AIQuestion,
} from "./AIQuestionGeneratorDialog";

export type QuizFormValue = {
  title: string;
  description: string;
  scheduledStartLocal: string;
  questionTimeMs: number;
  prizeAmounts: string[];
  minParticipants: number;
  lobbyOpenLeadMs: number;
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
  minParticipants: number;
  lobbyOpenLeadMs: number;
  difficulty: Difficulty;
  coverColor: CoverColor;
  payoutToken: PayoutTokenSymbol;
  questions: QuizFormValue["questions"];
};

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const TABS = ["basics", "questions", "prizes", "review"] as const;
type QuizFormTab = (typeof TABS)[number];
const CHOICE_IDS = ["a", "b", "c", "d"] as const;
const LOBBY_PRESETS = [
  { label: "5 min", value: 5 * 60_000 },
  { label: "15 min", value: 15 * 60_000 },
  { label: "1 hour", value: 60 * 60_000 },
] as const;
const MAX_PRIZE_RANKS = 1000;

type PrizeTierRow = {
  id: string;
  from: string;
  to: string;
  amount: string;
};

const DEFAULT_PRIZE_ROWS: Omit<PrizeTierRow, "id">[] = [
  { from: "1", to: "1", amount: "25" },
  { from: "2", to: "2", amount: "15" },
  { from: "3", to: "3", amount: "5" },
  { from: "4", to: "100", amount: "0.30" },
  { from: "101", to: "200", amount: "0.10" },
  { from: "201", to: "500", amount: "0.05" },
];

let prizeTierIdCounter = 0;

function newPrizeTierId(): string {
  prizeTierIdCounter += 1;
  return `prize-tier-${prizeTierIdCounter}`;
}

function withPrizeRowIds(rows: Omit<PrizeTierRow, "id">[]): PrizeTierRow[] {
  return rows.map((row) => ({ ...row, id: newPrizeTierId() }));
}

function defaultValue(): QuizFormValue {
  return {
    title: "",
    description: "",
    scheduledStartLocal: "",
    questionTimeMs: 15_000,
    prizeAmounts: prizeRowsToAmounts(withPrizeRowIds(DEFAULT_PRIZE_ROWS)).amounts,
    minParticipants: 1,
    lobbyOpenLeadMs: 5 * 60_000,
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
    minParticipants: quiz.minParticipants,
    lobbyOpenLeadMs: quiz.lobbyOpenLeadMs,
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

type PrizeTier = {
  from: number;
  to: number;
  amount: string;
  count: number;
  subtotal: number;
};

function normalizePrizeAmount(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(trimmed)) return null;
  return trimmed;
}

function prizeDecimalPlaces(raw: string): number {
  return raw.trim().split(".")[1]?.length ?? 0;
}

function prizeNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function clampRank(raw: string | number, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_PRIZE_RANKS, Math.max(1, Math.floor(n)));
}

function resizePrizes(amounts: string[], count: number): string[] {
  const safeCount = clampRank(count, amounts.length || 1);
  const next = amounts.slice(0, safeCount);
  const fill = next[next.length - 1] ?? amounts[amounts.length - 1] ?? "0";
  while (next.length < safeCount) next.push(fill);
  return next;
}

function compressPrizeAmounts(amounts: string[]): PrizeTier[] {
  const tiers: PrizeTier[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const amount = amounts[i] ?? "0";
    const previous = tiers[tiers.length - 1];
    if (previous && previous.amount === amount) {
      previous.to = i + 1;
      previous.count += 1;
      previous.subtotal += prizeNumber(amount);
    } else {
      tiers.push({
        from: i + 1,
        to: i + 1,
        amount,
        count: 1,
        subtotal: prizeNumber(amount),
      });
    }
  }
  return tiers;
}

function prizeRowsToAmounts(rows: PrizeTierRow[]): {
  amounts: string[];
  error: string | null;
} {
  if (rows.length === 0) return { amounts: [], error: "Add at least one reward row" };

  const parsed = rows
    .map((row, index) => {
      const from = Number(row.from);
      const to = Number(row.to);
      const amount = normalizePrizeAmount(row.amount);
      return { row, index, from, to, amount };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to || a.index - b.index);

  let maxTo = 0;
  const occupied = new Set<number>();
  for (const item of parsed) {
    if (
      !Number.isInteger(item.from) ||
      !Number.isInteger(item.to) ||
      item.from < 1 ||
      item.to < 1 ||
      item.from > MAX_PRIZE_RANKS ||
      item.to > MAX_PRIZE_RANKS
    ) {
      return {
        amounts: [],
        error: `Row ${item.index + 1}: ranks must be whole numbers from 1 to ${MAX_PRIZE_RANKS}`,
      };
    }
    if (item.from > item.to) {
      return {
        amounts: [],
        error: `Row ${item.index + 1}: start rank must be before end rank`,
      };
    }
    if (item.amount == null) {
      return {
        amounts: [],
        error: `Row ${item.index + 1}: reward must be a non-negative number`,
      };
    }
    for (let rank = item.from; rank <= item.to; rank++) {
      if (occupied.has(rank)) {
        return {
          amounts: [],
          error: `Row ${item.index + 1}: rank #${rank} is already covered by another row`,
        };
      }
      occupied.add(rank);
    }
    maxTo = Math.max(maxTo, item.to);
  }

  const amounts = Array.from({ length: maxTo }, () => "0");
  for (const item of parsed) {
    for (let rank = item.from; rank <= item.to; rank++) {
      amounts[rank - 1] = item.amount!;
    }
  }
  return { amounts, error: null };
}

function prizeRowsFromAmounts(amounts: string[]): PrizeTierRow[] {
  return compressPrizeAmounts(amounts).map((tier) => ({
    id: newPrizeTierId(),
    from: String(tier.from),
    to: String(tier.to),
    amount: tier.amount,
  }));
}

function rowWinners(row: PrizeTierRow): number {
  const from = Number(row.from);
  const to = Number(row.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return 0;
  return to - from + 1;
}

function rowSubtotal(row: PrizeTierRow): number {
  return rowWinners(row) * prizeNumber(row.amount);
}

export function QuizForm({
  initial,
  submitLabel = "Save",
  onSubmit,
}: {
  initial?: QuizFormValue;
  submitLabel?: string;
  onSubmit: (v: QuizFormSubmit) => Promise<void>;
}) {
  const initialValue = initial ?? defaultValue();
  const [v, setV] = useState<QuizFormValue>(initialValue);
  const [tab, setTab] = useState<QuizFormTab>("basics");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<AIGenerationContext | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prizeRows, setPrizeRows] = useState(() =>
    prizeRowsFromAmounts(initialValue.prizeAmounts),
  );
  const [prizePlanError, setPrizePlanError] = useState<string | null>(null);

  const patch = (p: Partial<QuizFormValue>) => setV((prev) => ({ ...prev, ...p }));
  const syncPrizeRows = (nextRows: PrizeTierRow[]) => {
    setPrizeRows(nextRows);
    const parsed = prizeRowsToAmounts(nextRows);
    setPrizePlanError(parsed.error);
    if (!parsed.error) patch({ prizeAmounts: parsed.amounts });
  };
  const tabIndex = TABS.indexOf(tab);
  const scheduleMissing = !v.scheduledStartLocal.trim();
  const requireScheduleBeforeLeavingBasics = (nextTab: QuizFormTab): boolean => {
    if (tab === "basics" && nextTab !== "basics" && scheduleMissing) {
      setError("Schedule start time is required before continuing");
      return false;
    }
    return true;
  };
  const goToTab = (nextTab: QuizFormTab) => {
    if (!requireScheduleBeforeLeavingBasics(nextTab)) return;
    setError(null);
    setTab(nextTab);
  };
  const goBack = () => goToTab(TABS[Math.max(0, tabIndex - 1)]!);
  const goNext = () => goToTab(TABS[Math.min(TABS.length - 1, tabIndex + 1)]!);

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
      const correctChoiceId = remap.get(q.correctChoiceId) ?? choices[0]?.id ?? "a";
      return { prompt: q.prompt, choices, correctChoiceId };
    });
    patch({
      questions: normalized.length > 0 ? normalized : [blankQuestion()],
      difficulty: ctx.difficulty,
      title: v.title.trim()
        ? v.title
        : ctx.topic.charAt(0).toUpperCase() + ctx.topic.slice(1),
      description: v.description.trim()
        ? v.description
        : `${ctx.count} ${ctx.difficulty.toLowerCase()} questions on ${ctx.topic}.`,
    });
    setAiDraft(ctx);
    setAiOpen(false);
    setTab("questions");
  };

  const update = async () => {
    setError(null);
    if (!v.title.trim()) {
      setTab("basics");
      setError("Game title is required");
      return;
    }
    if (scheduleMissing) {
      setTab("basics");
      setError("Schedule start time is required before creating the game");
      return;
    }
    if (v.questions.length < 1) {
      setTab("questions");
      setError("Add at least one question");
      return;
    }
    const parsedPrizePlan = prizeRowsToAmounts(prizeRows);
    if (parsedPrizePlan.error) {
      setTab("prizes");
      setError(parsedPrizePlan.error);
      return;
    }
    const prizeAmounts = parsedPrizePlan.amounts;
    if (prizeAmounts.length < 1 || prizeAmounts.length > MAX_PRIZE_RANKS) {
      setTab("prizes");
      setError(`Prize plan must include between 1 and ${MAX_PRIZE_RANKS} ranks`);
      return;
    }
    for (let i = 0; i < prizeAmounts.length; i++) {
      if (normalizePrizeAmount(prizeAmounts[i] ?? "") == null) {
        setTab("prizes");
        setError(`Rank ${i + 1}: reward must be a non-negative number`);
        return;
      }
      const decimals = getPayoutToken(v.payoutToken).decimals;
      if (prizeDecimalPlaces(prizeAmounts[i] ?? "") > decimals) {
        setTab("prizes");
        setError(
          `Rank ${i + 1}: ${v.payoutToken} rewards support at most ${decimals} decimal places`,
        );
        return;
      }
    }
    for (let i = 0; i < v.questions.length; i++) {
      const q = v.questions[i]!;
      if (!q.prompt.trim()) {
        setTab("questions");
        setError(`Question ${i + 1}: prompt is required`);
        return;
      }
      for (const c of q.choices) {
        if (!c.label.trim()) {
          setTab("questions");
          setError(`Question ${i + 1}: choice ${c.id.toUpperCase()} is empty`);
          return;
        }
      }
      if (!q.choices.find((c) => c.id === q.correctChoiceId)) {
        setTab("questions");
        setError(`Question ${i + 1}: correct answer is missing`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title: v.title.trim(),
        description: v.description.trim() || null,
        scheduledStart: v.scheduledStartLocal
          ? localDatetimeInputToIsoUtc(v.scheduledStartLocal)
          : null,
        questionTimeMs: v.questionTimeMs,
        prizeAmounts: prizeAmounts.map((s) => s.trim()),
        minParticipants: Math.max(1, Math.floor(v.minParticipants)),
        lobbyOpenLeadMs: v.lobbyOpenLeadMs,
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
  const prizeTiers = useMemo(
    () => compressPrizeAmounts(v.prizeAmounts),
    [v.prizeAmounts],
  );
  const sortedPrizeRows = useMemo(
    () =>
      [...prizeRows].sort(
        (a, b) =>
          Number(a.from || 0) - Number(b.from || 0) ||
          Number(a.to || 0) - Number(b.to || 0),
      ),
    [prizeRows],
  );
  const maxPrizeRank = useMemo(
    () => Math.max(0, ...prizeRows.map((row) => Number(row.to) || 0)),
    [prizeRows],
  );
  const paidRanks = useMemo(
    () => v.prizeAmounts.filter((a) => prizeNumber(a) > 0).length,
    [v.prizeAmounts],
  );

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
        {TABS.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => goToTab(id)}
            disabled={tab === "basics" && id !== "basics" && scheduleMissing}
            className={`adm-tab${tab === id ? " active" : ""}`}
          >
            {i + 1}. {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
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
                      onChange={(e) => {
                        patch({ scheduledStartLocal: e.target.value });
                        if (error?.startsWith("Schedule start time")) setError(null);
                      }}
                    />
                    {scheduleMissing && (
                      <div
                        style={{
                          marginTop: 6,
                          color: "var(--a-wrong)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Required before continuing.
                      </div>
                    )}
                  </div>
                  <div className="adm-field">
                    <label>Minimum participants</label>
                    <input
                      type="number"
                      min={1}
                      className="adm-input"
                      value={v.minParticipants}
                      onChange={(e) =>
                        patch({ minParticipants: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </div>
                  <div className="adm-field">
                    <label>Lobby opens</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {LOBBY_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => patch({ lobbyOpenLeadMs: preset.value })}
                          className={`adm-btn adm-btn--sm${v.lobbyOpenLeadMs === preset.value ? " adm-btn--primary" : ""}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      gridColumn: "1/-1",
                      padding: 12,
                      borderRadius: 8,
                      background: "var(--a-bg)",
                      border: "1px solid var(--a-line)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--a-ink-soft)",
                    }}
                  >
                    Players can join from {Math.round(v.lobbyOpenLeadMs / 60_000)} minutes before start.
                    If fewer than {v.minParticipants} join by start time, the lobby stays open until quorum is reached.
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "questions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {aiDraft && (
                <div
                  className="adm-card"
                  style={{
                    borderColor: "var(--a-primary)",
                    background: "var(--a-primary-tint)",
                  }}
                >
                  <div
                    style={{
                      padding: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, color: "var(--a-primary)" }}>
                        AI draft ready
                      </div>
                      <div style={{ fontSize: 12, color: "var(--a-ink-soft)", marginTop: 2 }}>
                        {aiDraft.count} {aiDraft.difficulty.toLowerCase()} questions on {aiDraft.topic}. Review and edit before creating the game.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="adm-btn adm-btn--sm adm-btn--ai"
                        onClick={() => setAiOpen(true)}
                      >
                        ✨ Regenerate
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn--sm adm-btn--primary"
                        onClick={() => setTab("review")}
                      >
                        Approve draft
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="adm-h3">Questions ({v.questions.length})</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm adm-btn--ai"
                    onClick={() => setAiOpen(true)}
                  >
                    ✨ Generate with AI
                  </button>
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
                  {paidRanks} paid ranks · Total: {Number(totalPool.toFixed(6))} {v.payoutToken}
                </div>
              </div>
              <div style={{ padding: 18 }}>
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
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "var(--a-ink-soft)",
                    }}
                  >
                    Highest paid rank: #{maxPrizeRank || 0} · Max {MAX_PRIZE_RANKS}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm"
                      onClick={() => {
                        const rows = withPrizeRowIds(DEFAULT_PRIZE_ROWS);
                        syncPrizeRows(rows);
                        setError(null);
                      }}
                    >
                      Use $100 default
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm adm-btn--primary"
                      disabled={maxPrizeRank >= MAX_PRIZE_RANKS}
                      onClick={() => {
                        const from = Math.min(MAX_PRIZE_RANKS, maxPrizeRank + 1 || 1);
                        const to = Math.min(MAX_PRIZE_RANKS, from + 99);
                        const lastAmount =
                          sortedPrizeRows[sortedPrizeRows.length - 1]?.amount ?? "0.05";
                        syncPrizeRows([
                          ...prizeRows,
                          {
                            id: newPrizeTierId(),
                            from: String(from),
                            to: String(to),
                            amount: lastAmount,
                          },
                        ]);
                        setError(null);
                      }}
                    >
                      Add range
                    </button>
                  </div>
                </div>

                {prizePlanError && (
                  <div
                    className="rounded-md px-3 py-2 text-sm"
                    style={{
                      background: "var(--a-wrong-tint)",
                      color: "var(--a-wrong)",
                      marginBottom: 10,
                    }}
                  >
                    {prizePlanError}
                  </div>
                )}

                <div className="adm-card" style={{ borderRadius: 8, overflow: "hidden" }}>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Start rank</th>
                        <th>End rank</th>
                        <th className="num">Reward</th>
                        <th className="num">Winners</th>
                        <th className="num">Subtotal</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPrizeRows.map((row, rowIndex) => {
                        const nextRow = sortedPrizeRows[rowIndex + 1];
                        const insertFrom = (Number(row.to) || 0) + 1;
                        const insertLimit = nextRow
                          ? (Number(nextRow.from) || insertFrom) - 1
                          : MAX_PRIZE_RANKS;
                        const canAddAfter =
                          Number.isInteger(insertFrom) &&
                          insertFrom >= 1 &&
                          insertFrom <= insertLimit &&
                          insertFrom <= MAX_PRIZE_RANKS;
                        return (
                          <tr key={row.id}>
                            <td>
                              <input
                                className="adm-input"
                                type="number"
                                min={1}
                                max={MAX_PRIZE_RANKS}
                                value={row.from}
                                onChange={(e) => {
                                  syncPrizeRows(
                                    prizeRows.map((r) =>
                                      r.id === row.id
                                        ? { ...r, from: e.target.value }
                                        : r,
                                    ),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="adm-input"
                                type="number"
                                min={1}
                                max={MAX_PRIZE_RANKS}
                                value={row.to}
                                onChange={(e) => {
                                  syncPrizeRows(
                                    prizeRows.map((r) =>
                                      r.id === row.id ? { ...r, to: e.target.value } : r,
                                    ),
                                  );
                                }}
                              />
                            </td>
                            <td className="num">
                              <input
                                className="adm-input"
                                inputMode="decimal"
                                value={row.amount}
                                onChange={(e) => {
                                  syncPrizeRows(
                                    prizeRows.map((r) =>
                                      r.id === row.id
                                        ? { ...r, amount: e.target.value }
                                        : r,
                                    ),
                                  );
                                }}
                              />
                            </td>
                            <td className="num">{rowWinners(row)}</td>
                            <td className="num" style={{ fontWeight: 800 }}>
                              {Number(rowSubtotal(row).toFixed(6))} {v.payoutToken}
                            </td>
                            <td className="text-right">
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  gap: 6,
                                }}
                              >
                                <button
                                  type="button"
                                  className="adm-btn adm-btn--sm"
                                  disabled={!canAddAfter}
                                  onClick={() => {
                                    const insertTo = Math.min(insertLimit, insertFrom + 99);
                                    const newRow = {
                                      id: newPrizeTierId(),
                                      from: String(insertFrom),
                                      to: String(insertTo),
                                      amount: row.amount,
                                    };
                                    const nextRows = [...prizeRows];
                                    const sourceIndex = nextRows.findIndex(
                                      (r) => r.id === row.id,
                                    );
                                    nextRows.splice(sourceIndex + 1, 0, newRow);
                                    syncPrizeRows(nextRows);
                                    setError(null);
                                  }}
                                >
                                  Add after
                                </button>
                                <button
                                  type="button"
                                  className="adm-btn adm-btn--sm"
                                  disabled={prizeRows.length <= 1}
                                  onClick={() => {
                                    syncPrizeRows(prizeRows.filter((r) => r.id !== row.id));
                                    setError(null);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                <ReviewRow
                  label="Quorum"
                  value={`${v.minParticipants} players · ${Math.round(v.lobbyOpenLeadMs / 60_000)} min lobby`}
                />
                <ReviewRow label="Questions" value={String(v.questions.length)} />
                <ReviewRow
                  label="Pool ranks"
                  value={`${paidRanks}/${v.prizeAmounts.length} paid (total $${Number(totalPool.toFixed(6))})`}
                />
              </div>
            </div>
          )}
        </div>

        <PreviewCard v={v} totalPool={totalPool} />
      </div>

      <div
        className="adm-card"
        style={{
          marginTop: 16,
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--a-ink-soft)" }}>
          Step {tabIndex + 1} of {TABS.length}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="adm-btn adm-btn--ai"
          >
            ✨ AI
          </button>
          {tabIndex > 0 && (
            <button type="button" onClick={goBack} className="adm-btn">
              Back
            </button>
          )}
          {tabIndex < TABS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={tab === "basics" && scheduleMissing}
              className="adm-btn adm-btn--primary"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={update}
              disabled={submitting}
              className="adm-btn adm-btn--primary"
            >
              {submitting ? "Saving…" : submitLabel}
            </button>
          )}
        </div>
      </div>

      <AIQuestionGeneratorDialog
        open={aiOpen}
        mode="live"
        defaultCount={10}
        defaultWithExplanations={false}
        onCancel={() => setAiOpen(false)}
        onGenerated={onAIGenerated}
      />
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
          <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.9, marginBottom: 10 }}>
            Top {v.prizeAmounts.filter((a) => prizeNumber(a) > 0).length} paid · lobby opens {Math.round(v.lobbyOpenLeadMs / 60_000)}m early
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
