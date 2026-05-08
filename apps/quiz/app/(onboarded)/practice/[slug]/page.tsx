"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Choice } from "@mini-quiz/shared";
import { fireConfetti } from "@/components/ConfettiBurst";
import { Loader } from "@/components/Loader";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { ProgressBar } from "@/components/ProgressBar";
import { api } from "@/lib/api-client";
import { useProfile } from "@/lib/profile-context";

type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
};
type StartResp = {
  kind: "ok";
  playId: string;
  topicId: string;
  title: string;
  questions: Question[];
};
type AnswerResp = {
  isCorrect: boolean;
  correctChoiceId: string;
  explanation: string | null;
};
type FinishResp = {
  scoreCorrect: number;
  scoreTotal: number;
  newBadges: string[];
};

export default function PracticePlayPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { state } = useProfile();
  const wallet = state.status === "ready" ? state.walletAddress : null;
  const [start, setStart] = useState<StartResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [picking, setPicking] = useState(false);
  // Picked tile while we're awaiting the server response. Drives the
  // optimistic "locked-in" visual so the user sees feedback immediately
  // on tap even before the network round-trip completes.
  const [pickedChoiceId, setPickedChoiceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerResp | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [finish, setFinish] = useState<FinishResp | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!wallet) return;
    void (async () => {
      try {
        const res = await api.post<StartResp>("/practice/start", {
          walletAddress: wallet,
          slug,
        });
        if (!cancel) setStart(res);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Could not start");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [wallet, slug]);

  const submit = async (q: Question, choiceId: string) => {
    if (!wallet || picking || !start || pickedChoiceId) return;
    // Lock picked tile + dim siblings IMMEDIATELY (zero-latency feedback).
    setPicking(true);
    setPickedChoiceId(choiceId);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }
    try {
      const res = await api.post<AnswerResp>("/practice/answer", {
        walletAddress: wallet,
        playId: start.playId,
        questionId: q.id,
        choiceId,
      });
      setFeedback(res);
      setScore((s) => ({
        correct: s.correct + (res.isCorrect ? 1 : 0),
        total: s.total + 1,
      }));
      if (res.isCorrect) fireConfetti();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setPicking(false);
    }
  };

  const next = async () => {
    if (!start) return;
    if (idx + 1 >= start.questions.length) {
      try {
        const res = await api.post<FinishResp>("/practice/finish", {
          walletAddress: wallet,
          playId: start.playId,
        });
        setFinish(res);
        if (res.scoreCorrect === res.scoreTotal && res.scoreTotal > 0) fireConfetti();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Finish failed");
      }
    } else {
      setIdx((i) => i + 1);
      setFeedback(null);
      setPickedChoiceId(null);
    }
  };

  if (state.status !== "ready")
    return <Loader label="Getting your topic ready…" pose="think" />;
  if (error)
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        <Mango pose="sleep" size={100} />
        <p style={{ marginTop: 16 }}>{error}</p>
        <Link href="/practice" style={{ textDecoration: "none" }}>
          <MQButton variant="ghost" block>
            Back to practice
          </MQButton>
        </Link>
      </div>
    );
  if (finish) {
    return (
      <div
        className="mq-page"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Mango
          pose={finish.scoreCorrect === finish.scoreTotal ? "cheer" : "think"}
          size={140}
        />
        <h1 className="mq-h1">Done practicing</h1>
        <MQCard style={{ padding: 18, width: "100%", maxWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Correct</span>
            <strong>
              {finish.scoreCorrect}/{finish.scoreTotal}
            </strong>
          </div>
          {finish.newBadges.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ display: "block", marginBottom: 6 }}>New badges</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {finish.newBadges.map((b) => (
                  <Pill key={b}>{b.replace(/_/g, " ")}</Pill>
                ))}
              </div>
            </div>
          )}
        </MQCard>
        <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: 360 }}>
          <Link href="/practice" style={{ textDecoration: "none" }}>
            <MQButton variant="primary" block>
              Try another topic
            </MQButton>
          </Link>
          <Link href="/" style={{ textDecoration: "none" }}>
            <MQButton variant="ghost" block>
              Home
            </MQButton>
          </Link>
        </div>
      </div>
    );
  }
  if (!start) return <Loader label="Loading topic…" pose="think" />;
  const q = start.questions[idx];
  if (!q)
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        Wrapping up…
      </div>
    );

  return (
    <div
      className="mq-page"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Pill>
          Q{idx + 1} / {start.questions.length}
        </Pill>
        <Pill>{start.title}</Pill>
      </div>
      <ProgressBar pct={((idx + 1) / start.questions.length) * 100} />

      <MQCard style={{ padding: 18 }}>
        <h2 className="mq-h2" style={{ marginBottom: 16 }}>
          {q.prompt}
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {q.choices.map((c) => {
            // Three states drive the visual:
            //   - resolved + correct answer  → green
            //   - resolved + this was the user's wrong pick → red
            //   - locked but not resolved → primary blue (optimistic)
            //   - default → neutral
            const isResolved = feedback != null;
            const isCorrectAnswer =
              isResolved && feedback!.correctChoiceId === c.id;
            const isWrongPick =
              isResolved &&
              !feedback!.isCorrect &&
              pickedChoiceId === c.id;
            const isLocked = pickedChoiceId !== null;
            const isPickedOptimistic =
              isLocked && !isResolved && pickedChoiceId === c.id;

            let border = "1px solid var(--ink-faint)";
            let bg = "var(--surface-1, white)";
            let opacity = 1;
            if (isCorrectAnswer) {
              border = "2px solid var(--good, #16a34a)";
              bg = "var(--good-bg, #d1fae5)";
            } else if (isWrongPick) {
              border = "2px solid var(--wrong, #ef4444)";
              bg = "var(--wrong-bg, #fee2e2)";
            } else if (isPickedOptimistic) {
              border = "2px solid var(--primary)";
              bg = "var(--primary-bg, #dbeafe)";
            } else if (isLocked || isResolved) {
              opacity = 0.5;
            }

            return (
              <button
                key={c.id}
                type="button"
                disabled={isLocked}
                onClick={() => void submit(q, c.id)}
                className="mq-press"
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border,
                  background: bg,
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: 15,
                  opacity,
                  cursor: isLocked ? "default" : "pointer",
                  transform: isPickedOptimistic ? "translateY(1px)" : undefined,
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    marginRight: 8,
                    color: isCorrectAnswer
                      ? "var(--good, #16a34a)"
                      : isWrongPick
                        ? "var(--wrong, #ef4444)"
                        : "var(--primary)",
                  }}
                >
                  {c.id.toUpperCase()}.
                </span>
                {c.label}
                {isPickedOptimistic && (
                  <span
                    style={{
                      float: "right",
                      fontSize: 12,
                      color: "var(--primary)",
                      fontWeight: 700,
                    }}
                  >
                    ✓ locked in
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: feedback.isCorrect
                ? "var(--good-bg, #d1fae5)"
                : "var(--wrong-bg, #fee2e2)",
              color: feedback.isCorrect ? "var(--good, #065f46)" : "var(--wrong, #991b1b)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {feedback.isCorrect ? "Correct!" : "Not quite."}
            {feedback.explanation && (
              <div style={{ fontWeight: 500, marginTop: 6, fontStyle: "italic" }}>
                {feedback.explanation}
              </div>
            )}
          </div>
        )}
      </MQCard>

      {feedback && (
        <MQButton variant="primary" block onClick={() => void next()}>
          {idx + 1 >= start.questions.length ? "Finish" : "Next question"}
        </MQButton>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--ink-faint)",
          marginTop: 4,
        }}
      >
        <span>
          Correct so far: {score.correct}/{score.total}
        </span>
        <Link href="/practice" style={{ color: "var(--ink-faint)" }}>
          Quit
        </Link>
      </div>
    </div>
  );
}
