"use client";

import type { Choice } from "@mini-quiz/shared";

export function AnswerDistribution({
  prompt,
  choices,
  correctChoiceId,
  distribution,
  answeredCount,
  thinkingCount,
}: {
  prompt: string | null;
  choices: Choice[];
  correctChoiceId: string | null;
  distribution: { choiceId: string; count: number }[];
  answeredCount: number;
  thinkingCount: number;
}) {
  const distMap = new Map(distribution.map((d) => [d.choiceId, d.count]));
  const total = answeredCount || 1;

  return (
    <>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 18,
          marginBottom: 14,
        }}
      >
        {prompt ? `"${prompt}"` : "Waiting for first question…"}
      </div>
      {choices.map((c, idx) => {
        const count = distMap.get(c.id) ?? 0;
        const pct = Math.round((count / total) * 100);
        const isCorrect = c.id === correctChoiceId;
        const letter = String.fromCharCode(65 + idx);
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: isCorrect ? "var(--a-primary)" : "var(--a-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isCorrect ? "white" : "var(--a-ink-soft)",
                  fontWeight: 900,
                  fontSize: 11,
                }}
              >
                {letter}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
              {isCorrect && (
                <span className="adm-badge paid" style={{ marginLeft: 4 }}>
                  CORRECT
                </span>
              )}
              <div
                style={{
                  marginLeft: "auto",
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {pct}%
                <span
                  style={{
                    color: "var(--a-ink-faint)",
                    fontWeight: 600,
                    fontSize: 11,
                    marginLeft: 6,
                  }}
                >
                  · {count}
                </span>
              </div>
            </div>
            <div
              style={{
                height: 8,
                background: "var(--a-line-soft)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: isCorrect ? "var(--a-primary)" : "var(--a-ink-faint)",
                  transition: "width 200ms ease-out",
                }}
              />
            </div>
          </div>
        );
      })}
      <div
        style={{
          fontSize: 11,
          color: "var(--a-ink-faint)",
          fontWeight: 700,
          marginTop: 4,
        }}
      >
        {answeredCount} answered · {thinkingCount} thinking
      </div>
    </>
  );
}
