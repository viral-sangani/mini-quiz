"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BigButton } from "@/components/BigButton";
import { Mascot } from "@/components/Mascot";
import { AnswerChoice } from "@/components/AnswerChoice";
import { Countdown } from "@/components/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { MiniPayGate } from "@/components/MiniPayGate";
import { fireConfetti } from "@/components/ConfettiBurst";
import { connectAddress, hasInjectedWallet } from "@/lib/minipay";
import { BLOCKSCOUT_TX } from "@/lib/celo";
import type { LeaderboardRow, RoomEvent } from "@/lib/events";

type RoomStatus = "lobby" | "live" | "ended";

type RoomInfo = {
  id: string;
  status: RoomStatus;
  startedAt: number | null;
  endsAt: number | null;
  durationMs: number;
  questionTimeMs: number;
  prizeAmounts: string[];
  playerCount: number;
};

type Choice = { id: string; label: string };
type Question = {
  id: string;
  position: number;
  prompt: string;
  choices: Choice[];
};

type PayoutInfo = {
  rank: number;
  playerId: string;
  amount: string;
  txHash: string;
  confirmed: boolean;
};

type Phase =
  | "booting"
  | "gate"
  | "room_missing"
  | "naming"
  | "joining"
  | "waiting_lobby"
  | "playing"
  | "finished"
  | "room_ended";

type AnswerState = "idle" | "selected" | "correct" | "wrong" | "disabled";

const DEV_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatPrize(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toFixed(2).replace(/\.00$/, "");
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayInner />
    </Suspense>
  );
}

function PlayInner() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const roomId = (params?.roomId ?? "").toString().toUpperCase();
  const providedName = searchParams.get("name") ?? "";
  const devMode = searchParams.get("dev") === "1";

  const [phase, setPhase] = useState<Phase>("booting");
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [name, setName] = useState<string>(providedName.trim().slice(0, 30));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<number>(0);

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<boolean>(false);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    points: number;
  } | null>(null);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [totalPoints, setTotalPoints] = useState<number>(0);

  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutInfo[]>([]);
  const [celebrationPayout, setCelebrationPayout] = useState<PayoutInfo | null>(null);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownFiredRef = useRef<boolean>(false);

  const pageUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Boot: wallet + fetch room.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    (async () => {
      if (!hasInjectedWallet()) {
        if (devMode) {
          if (!cancelled) setAddress(DEV_ADDRESS);
        } else {
          if (!cancelled) setPhase("gate");
          return;
        }
      } else {
        try {
          const addr = await connectAddress();
          if (cancelled) return;
          if (addr) setAddress(addr);
          else if (devMode) setAddress(DEV_ADDRESS);
          else {
            setPhase("gate");
            return;
          }
        } catch {
          if (!cancelled) {
            if (devMode) setAddress(DEV_ADDRESS);
            else {
              setPhase("gate");
              return;
            }
          }
        }
      }

      try {
        const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setPhase("room_missing");
          return;
        }
        if (!res.ok) {
          setErrorMsg("Couldn't load room. Please try again.");
          setPhase("room_missing");
          return;
        }
        const info = (await res.json()) as RoomInfo;
        if (cancelled) return;
        setRoom(info);
        setPlayerCount(info.playerCount ?? 0);

        if (info.status === "ended") {
          setPhase("room_ended");
          return;
        }

        if (providedName.trim().length > 0) {
          setPhase("joining");
        } else {
          setPhase("naming");
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Network error.");
          setPhase("room_missing");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, roomId, devMode, providedName]);

  // Auto-join when we have a prefilled name.
  const submitJoin = useCallback(
    async (nameToSubmit: string) => {
      const trimmed = nameToSubmit.trim().slice(0, 30);
      if (!trimmed || !room) return;
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed, address: address ?? undefined }),
        });
        if (res.status === 404) {
          setPhase("room_missing");
          return;
        }
        if (res.status === 409) {
          setPhase("room_ended");
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setErrorMsg(text || "Couldn't join — try again");
          setPhase("naming");
          return;
        }
        const data = (await res.json()) as { playerId: string; name: string };
        setPlayerId(data.playerId);
        setName(data.name);
        if (room.status === "live") {
          setPhase("playing");
        } else {
          setPhase("waiting_lobby");
        }
      } catch {
        setErrorMsg("Network error. Try again.");
        setPhase("naming");
      }
    },
    [address, room, roomId]
  );

  useEffect(() => {
    if (phase !== "joining") return;
    void submitJoin(name);
  }, [phase, name, submitJoin]);

  // Subscribe to SSE once we have a playerId.
  useEffect(() => {
    if (!playerId) return;
    const es = new EventSource(`/api/rooms/${roomId}/events`);

    es.onmessage = (ev) => {
      let data: RoomEvent;
      try {
        data = JSON.parse(ev.data) as RoomEvent;
      } catch {
        return;
      }
      switch (data.type) {
        case "player_joined":
          setPlayerCount((c) => c + 1);
          break;
        case "room_started":
          setRoom((prev) =>
            prev
              ? { ...prev, status: "live", startedAt: data.startedAt, endsAt: data.endsAt }
              : prev
          );
          setPhase((p) => (p === "waiting_lobby" ? "playing" : p));
          break;
        case "leaderboard":
          setLeaderboardRows(data.rows);
          break;
        case "room_ended":
          setRoom((prev) => (prev ? { ...prev, status: "ended" } : prev));
          setPhase((p) => (p === "playing" ? "finished" : p));
          break;
        case "payout_sent": {
          const payout: PayoutInfo = {
            rank: data.rank,
            playerId: data.playerId,
            amount: data.amount,
            txHash: data.txHash,
            confirmed: false,
          };
          setPayouts((prev) => {
            const without = prev.filter(
              (p) => !(p.rank === payout.rank && p.playerId === payout.playerId)
            );
            return [...without, payout];
          });
          if (data.playerId === playerId) {
            setCelebrationPayout(payout);
            fireConfetti();
          }
          break;
        }
        case "payout_confirmed": {
          const payout: PayoutInfo = {
            rank: data.rank,
            playerId: data.playerId,
            amount: data.amount,
            txHash: data.txHash,
            confirmed: true,
          };
          setPayouts((prev) => {
            const without = prev.filter(
              (p) => !(p.rank === payout.rank && p.playerId === payout.playerId)
            );
            return [...without, payout];
          });
          if (data.playerId === playerId) {
            setCelebrationPayout(payout);
            fireConfetti();
          }
          break;
        }
        default:
          break;
      }
    };

    es.onerror = () => {
      // Let the browser auto-reconnect.
    };

    return () => {
      es.close();
    };
  }, [playerId, roomId]);

  // When entering playing, fetch questions.
  useEffect(() => {
    if (phase !== "playing" || questions !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/questions`, { cache: "no-store" });
        if (!res.ok) throw new Error("questions fetch failed");
        const data = (await res.json()) as { questions: Question[] };
        if (cancelled) return;
        const sorted = [...data.questions].sort((a, b) => a.position - b.position);
        setQuestions(sorted);
        setCurrentIndex(0);
        setQuestionStartedAt(Date.now());
        setSelectedChoiceId(null);
        setAnswerResult(null);
        setResolving(false);
      } catch {
        if (!cancelled) setErrorMsg("Couldn't load questions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, questions, roomId]);

  // Reset per-question state when index changes.
  useEffect(() => {
    if (phase !== "playing" || !questions) return;
    setSelectedChoiceId(null);
    setAnswerResult(null);
    setResolving(false);
    setQuestionStartedAt(Date.now());
    countdownFiredRef.current = false;
  }, [currentIndex, phase, questions]);

  // Clean advance timer on unmount/phase change.
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, []);

  const currentQuestion = useMemo<Question | null>(() => {
    if (!questions) return null;
    return questions[currentIndex] ?? null;
  }, [questions, currentIndex]);

  const advanceToNext = useCallback(() => {
    if (!questions) return;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setSelectedChoiceId(null);
    setResolving(false);
    if (currentIndex >= questions.length - 1) {
      setPhase("finished");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, questions]);

  const submitAnswer = useCallback(
    async (choiceId: string) => {
      if (!playerId || !currentQuestion || resolving) return;
      setResolving(true);
      setSelectedChoiceId(choiceId);
      const timeTakenMs = Date.now() - questionStartedAt;
      try {
        const res = await fetch(`/api/rooms/${roomId}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId,
            questionId: currentQuestion.id,
            choiceId,
            timeTakenMs,
          }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            // already answered or room state wrong — just move on.
            if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = setTimeout(advanceToNext, 600);
            return;
          }
          throw new Error("answer failed");
        }
        const data = (await res.json()) as { isCorrect: boolean; points: number };
        setAnswerResult(data);
        if (data.isCorrect) {
          setCorrectCount((c) => c + 1);
          fireConfetti();
        }
        setTotalPoints((p) => p + (data.points || 0));
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(advanceToNext, 1200);
      } catch {
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(advanceToNext, 800);
      }
    },
    [advanceToNext, currentQuestion, playerId, questionStartedAt, resolving, roomId]
  );

  // Countdown-to-zero handler — auto-submit sentinel.
  const onQuestionTimeout = useCallback(() => {
    if (countdownFiredRef.current) return;
    countdownFiredRef.current = true;
    if (resolving || selectedChoiceId || !currentQuestion) return;
    void submitAnswer("");
  }, [currentQuestion, resolving, selectedChoiceId, submitAnswer]);

  // Hard global-end bound — if endsAt elapses while playing.
  useEffect(() => {
    if (phase !== "playing" || !room?.endsAt) return;
    const ms = room.endsAt - Date.now();
    if (ms <= 0) {
      setPhase("finished");
      return;
    }
    const id = setTimeout(() => setPhase("finished"), ms);
    return () => clearTimeout(id);
  }, [phase, room?.endsAt]);

  // Poll room status + leaderboard + payouts as a fallback to SSE. Serverless
  // instances don't share the SSE broker, so a subscriber on one instance
  // won't receive broadcasts from another. Polling every 2s makes the UI
  // self-heal — including the phase transition from waiting_lobby → playing
  // when the host presses Start on a different serverless instance.
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;

    async function tick() {
      try {
        const [roomRes, lbRes, payoutRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/leaderboard`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/payout`, { cache: "no-store" }),
        ]);
        if (cancelled) return;

        if (roomRes.ok) {
          const roomData = (await roomRes.json()) as RoomInfo;
          if (!cancelled) {
            setRoom(roomData);
            // Drive phase transitions from the authoritative room status.
            if (roomData.status === "live") {
              setPhase((p) => (p === "waiting_lobby" ? "playing" : p));
            } else if (roomData.status === "ended") {
              setPhase((p) =>
                p === "waiting_lobby" || p === "playing" ? "finished" : p
              );
            }
          }
        }

        if (lbRes.ok) {
          const data = (await lbRes.json()) as { rows: LeaderboardRow[] };
          if (!cancelled) setLeaderboardRows(data.rows);
        }
        if (payoutRes.ok) {
          const data = (await payoutRes.json()) as {
            payouts: {
              rank: number;
              playerId: string;
              amount: string;
              txHash: string;
              confirmedAt: number | null;
            }[];
          };
          if (!cancelled) {
            setPayouts(
              data.payouts.map((p) => ({
                rank: p.rank,
                playerId: p.playerId,
                amount: p.amount,
                txHash: p.txHash,
                confirmed: !!p.confirmedAt,
              }))
            );
          }
        }
      } catch {
        // non-fatal
      }
    }

    tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerId, roomId, phase]);

  const myRank = useMemo(() => {
    if (!playerId) return null;
    const i = leaderboardRows.findIndex((r) => r.playerId === playerId);
    return i >= 0 ? i + 1 : null;
  }, [leaderboardRows, playerId]);

  const myRow = useMemo(() => {
    if (!playerId) return null;
    return leaderboardRows.find((r) => r.playerId === playerId) ?? null;
  }, [leaderboardRows, playerId]);

  // ----------- Render -----------

  if (!mounted || phase === "booting") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
        <div className="flex flex-col items-center gap-3">
          <Mascot mood="thinking" size={88} />
          <p className="text-sm font-black uppercase tracking-wide text-duo-gray-dark">
            Loading…
          </p>
        </div>
      </main>
    );
  }

  if (phase === "gate") {
    return <MiniPayGate targetUrl={pageUrl} />;
  }

  if (phase === "room_missing") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-duo-gray-light bg-white p-6 text-center shadow-3d-lg">
          <Mascot mood="sad" size={88} />
          <h1 className="mt-2 font-display text-2xl font-black text-duo-ink">
            Room not found
          </h1>
          <p className="mt-1 text-sm font-semibold text-duo-gray-dark">
            {errorMsg ?? `We couldn't find room "${roomId}".`}
          </p>
          <div className="mt-5">
            <Link href="/join">
              <BigButton variant="green" size="lg" className="w-full">
                Try another code
              </BigButton>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "room_ended") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-duo-gray-light bg-white p-6 text-center shadow-3d-lg">
          <Mascot mood="sad" size={88} />
          <h1 className="mt-2 font-display text-2xl font-black text-duo-ink">
            Quiz has ended 🏁
          </h1>
          <p className="mt-1 text-sm font-semibold text-duo-gray-dark">
            Catch the next one! 💨
          </p>
          {leaderboardRows.length > 0 && (
            <div className="mt-5 text-left">
              <Leaderboard
                rows={leaderboardRows.slice(0, 5)}
                highlightPlayerId={playerId ?? undefined}
                payouts={payouts}
              />
            </div>
          )}
          <div className="mt-5">
            <Link href="/">
              <BigButton variant="ghost" size="lg" className="w-full">
                Home
              </BigButton>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "naming" || phase === "joining") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-3d-lg">
          <div className="flex flex-col items-center gap-2 text-center">
            <Mascot mood="happy" size={88} />
            <h1 className="font-display text-3xl font-black text-duo-ink">
              Room {roomId} ✨
            </h1>
            <p className="text-sm font-semibold text-duo-gray-dark">
              Pick a display name to join.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (phase === "joining") return;
              if (name.trim().length === 0) return;
              setPhase("joining");
            }}
            className="mt-6 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label
                htmlFor="player-name"
                className="text-xs font-black uppercase tracking-wide text-duo-gray-dark"
              >
                Your display name
              </label>
              <input
                id="player-name"
                type="text"
                autoComplete="nickname"
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                placeholder="e.g. Ana 🌶️"
                disabled={phase === "joining"}
                className="w-full rounded-2xl border-2 border-duo-gray-light bg-duo-cream px-4 py-3 text-base font-bold text-duo-ink outline-none focus:border-duo-blue disabled:opacity-60"
              />
              <div className="text-right text-xs font-semibold text-duo-gray-dark">
                {name.trim().length}/30
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border-2 border-duo-red bg-duo-red/10 px-3 py-2 text-sm font-bold text-duo-red">
                {errorMsg}
              </div>
            )}

            <BigButton
              type="submit"
              variant="green"
              size="xl"
              disabled={name.trim().length === 0 || phase === "joining"}
              className="w-full"
            >
              {phase === "joining" ? "Joining…" : "I'm in! 🙌"}
            </BigButton>

            {address && (
              <div className="text-center text-xs font-semibold text-duo-gray-dark">
                Connected: {truncateAddress(address)} ✨
                {devMode && address === DEV_ADDRESS && " (dev)"}
              </div>
            )}
          </form>
        </div>
      </main>
    );
  }

  if (phase === "waiting_lobby") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-duo-gray-light bg-white p-6 text-center shadow-3d-lg">
          <Mascot mood="idle" size={96} />
          <h1 className="mt-2 font-display text-3xl font-black text-duo-ink">
            Waiting for host…
          </h1>
          <p className="mt-1 text-sm font-semibold text-duo-gray-dark">
            The quiz will start any second now.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border-2 border-duo-gray-light bg-duo-cream px-4 py-2 text-sm font-black text-duo-ink">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-duo-green" />
            <span>
              {playerCount} {playerCount === 1 ? "player" : "players"} in room
            </span>
          </div>
          <div className="mt-4 text-xs font-semibold text-duo-gray-dark">
            Room {roomId} · Playing as{" "}
            <span className="font-black text-duo-ink">{name}</span>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "playing") {
    const total = questions?.length ?? 0;
    const q = currentQuestion;
    const qIndex = currentIndex;

    if (!q) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-duo-cream p-4">
          <div className="flex flex-col items-center gap-3">
            <Mascot mood="thinking" size={88} />
            <p className="text-sm font-black uppercase tracking-wide text-duo-gray-dark">
              Loading questions…
            </p>
          </div>
        </main>
      );
    }

    const progressPct = total > 0 ? ((qIndex + 1) / total) * 100 : 0;
    const perQuestionDeadline =
      questionStartedAt + (room?.questionTimeMs ?? 15_000);

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-duo-cream px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-black uppercase tracking-wide text-duo-gray-dark">
            Q {qIndex + 1} / {total}
          </div>
          <Countdown
            key={q.id}
            to={perQuestionDeadline}
            onDone={onQuestionTimeout}
            size="sm"
          />
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full border-2 border-duo-gray-light bg-white">
          <motion.div
            className="h-full rounded-full bg-duo-green"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex flex-col gap-6"
          >
            <div className="rounded-3xl border-2 border-duo-gray-light bg-white p-5 shadow-3d-sm">
              <h2 className="font-display text-xl font-black leading-snug text-duo-ink sm:text-2xl">
                {q.prompt}
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              {q.choices.map((choice, i) => {
                const letter = LETTERS[i] ?? String(i + 1);
                let state: AnswerState = "idle";
                if (selectedChoiceId === choice.id) {
                  if (answerResult?.isCorrect) state = "correct";
                  else if (answerResult && !answerResult.isCorrect) state = "wrong";
                  else state = "selected";
                } else if (resolving) {
                  state = "disabled";
                }
                return (
                  <AnswerChoice
                    key={choice.id}
                    letter={letter}
                    label={choice.label}
                    state={state}
                    onClick={() => {
                      if (resolving) return;
                      void submitAnswer(choice.id);
                    }}
                  />
                );
              })}
            </div>

            {answerResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border-2 px-4 py-3 text-center font-black ${
                  answerResult.isCorrect
                    ? "border-duo-green bg-duo-green/10 text-duo-green"
                    : "border-duo-red bg-duo-red/10 text-duo-red"
                }`}
              >
                {answerResult.isCorrect
                  ? `✅ +${answerResult.points} points`
                  : "❌ Not quite — next one!"}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    );
  }

  // phase === "finished"
  const top5 = leaderboardRows.slice(0, 5);
  const iAmTop3 = myRank !== null && myRank <= 3;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 bg-duo-cream px-4 py-6">
      <div className="rounded-3xl border-2 border-duo-gray-light bg-white p-6 text-center shadow-3d-lg">
        <Mascot mood={iAmTop3 ? "winner" : "happy"} size={96} />
        <h1 className="mt-2 font-display text-3xl font-black text-duo-ink">
          You&apos;re done! 🎉
        </h1>
        {myRank !== null ? (
          <p className="mt-1 text-base font-bold text-duo-gray-dark">
            You placed{" "}
            <span className="text-duo-ink">#{myRank}</span> of{" "}
            <span className="text-duo-ink">{leaderboardRows.length}</span>
          </p>
        ) : (
          <p className="mt-1 text-base font-bold text-duo-gray-dark">
            Hang tight — scoring up…
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <div className="flex min-w-[96px] flex-col items-center rounded-2xl border-2 border-duo-gray-light bg-duo-cream px-4 py-3">
            <div className="text-xs font-black uppercase text-duo-gray-dark">
              Correct
            </div>
            <div className="font-display text-3xl font-black text-duo-ink">
              {myRow?.correctCount ?? correctCount}
            </div>
          </div>
          <div className="flex min-w-[96px] flex-col items-center rounded-2xl border-2 border-duo-gray-light bg-duo-cream px-4 py-3">
            <div className="text-xs font-black uppercase text-duo-gray-dark">
              Points
            </div>
            <div className="font-display text-3xl font-black text-duo-ink">
              {myRow?.points ?? totalPoints}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {celebrationPayout && celebrationPayout.confirmed && (
          <motion.div
            key={celebrationPayout.txHash}
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="rounded-3xl border-2 border-duo-green bg-gradient-to-br from-duo-green to-celo-yellow/70 p-5 text-center text-white shadow-3d-lg"
          >
            <div className="font-display text-2xl font-black">
              🎉 You won {formatPrize(celebrationPayout.amount)} USDT!
            </div>
            <a
              href={BLOCKSCOUT_TX(celebrationPayout.txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded-full bg-white/90 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-duo-ink shadow-3d-sm"
            >
              View on Blockscout ✓
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {room?.status === "live" && room.endsAt && (
        <div className="rounded-3xl border-2 border-duo-yellow bg-gradient-to-br from-duo-yellow/20 to-celo-yellow/20 p-5 text-center shadow-3d-sm">
          <div className="text-xs font-black uppercase tracking-widest text-duo-ink">
            Winners announced in
          </div>
          <div className="mt-1 flex items-center justify-center">
            <Countdown
              to={room.endsAt}
              size="lg"
              onDone={() =>
                setRoom((prev) => (prev ? { ...prev, status: "ended" } : prev))
              }
            />
          </div>
          <p className="mt-2 text-sm font-bold text-duo-gray-dark">
            Hang tight — waiting for everyone to finish 🙌
          </p>
        </div>
      )}

      <div className="rounded-3xl border-2 border-duo-gray-light bg-white p-4 shadow-3d-sm">
        <h2 className="mb-3 font-display text-lg font-black text-duo-ink">
          Top players 🏆
        </h2>
        {top5.length > 0 ? (
          <Leaderboard
            rows={top5}
            highlightPlayerId={playerId ?? undefined}
            payouts={payouts}
          />
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-2xl bg-duo-gray-light/60"
              />
            ))}
          </div>
        )}
      </div>

    </main>
  );
}
