"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type {
  LeaderboardRow,
  PublicPayout,
  PublicQuestion,
  PublicQuiz,
  RoomEvent,
} from "@mini-quiz/shared";
import { BLOCKSCOUT_TX, lobbyPhase } from "@mini-quiz/shared";
import { Avatar } from "@/components/Avatar";
import { fireConfetti } from "@/components/ConfettiBurst";
import { Icon } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { MQCard } from "@/components/MQCard";
import { MiniPayGate } from "@/components/MiniPayGate";
import { Pill } from "@/components/Pill";
import { ProgressBar } from "@/components/ProgressBar";
import { StatTile } from "@/components/StatTile";
import { ApiError, api } from "@/lib/api-client";
import { useProfile } from "@/lib/profile-context";
import { useRoomEvents } from "@/lib/sse";
import { msUntil } from "@/lib/time";

type Phase =
  | "booting"
  | "gate"
  | "needs_onboarding"
  | "room_missing"
  | "pre_lobby"
  | "joining"
  | "waiting_lobby"
  | "closed"
  | "playing"
  | "finished";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const CHOICE_COLORS = [
  "var(--berry)",
  "var(--accent)",
  "var(--sky)",
  "var(--primary)",
  "var(--violet)",
  "var(--gold)",
];
const FEEDBACK_HOLD_MS = 1500;

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
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code ?? "").toString().toUpperCase();

  const { state: authState, refresh: refreshProfile } = useProfile();

  const [phase, setPhase] = useState<Phase>("booting");
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [roomPlayerId, setRoomPlayerId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<boolean>(false);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    points: number;
  } | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [totalPoints, setTotalPoints] = useState<number>(0);

  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [payouts, setPayouts] = useState<PublicPayout[]>([]);
  const [celebrationPayout, setCelebrationPayout] = useState<PublicPayout | null>(null);
  const [timerTick, setTimerTick] = useState<number>(0);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownFiredRef = useRef<boolean>(false);

  const userId = authState.status === "ready" ? authState.user.id : null;
  const walletAddress =
    authState.status === "ready" ? authState.walletAddress : null;
  const profile = authState.status === "ready" ? authState.profile : null;

  const pageUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  // ---------------- Boot: gated on auth state ----------------
  useEffect(() => {
    if (authState.status === "loading") return;
    if (authState.status === "no-wallet") {
      setPhase("gate");
      return;
    }
    if (authState.status === "needs-onboarding") {
      setPhase("needs_onboarding");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{
          quiz: PublicQuiz;
          questions: PublicQuestion[];
        }>(`/quizzes/${code}`);
        if (cancelled) return;
        setQuiz(data.quiz);
        setQuestions(data.questions);
        const lp = lobbyPhase({
          status: data.quiz.status,
          scheduledStart: data.quiz.scheduledStart,
        });
        if (lp === "ended") {
          setPhase("closed");
          return;
        }
        if (lp === "live") {
          // Quiz is live but we never joined → can't late-join.
          setPhase("closed");
          return;
        }
        if (lp === "pre-lobby") {
          setPhase("pre_lobby");
          return;
        }
        // lobby-open or starting — auto-join with the wallet (no name form).
        setPhase("joining");
      } catch {
        if (!cancelled) {
          setErrorMsg("Couldn't load quiz.");
          setPhase("room_missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.status, code]);

  // While in pre_lobby, watch the clock and flip to joining once the lobby opens.
  useEffect(() => {
    if (phase !== "pre_lobby" || !quiz?.scheduledStart) return;
    const tick = () => {
      const lp = lobbyPhase({
        status: quiz.status,
        scheduledStart: quiz.scheduledStart,
      });
      if (lp === "lobby-open" || lp === "starting") setPhase("joining");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, quiz?.scheduledStart, quiz?.status]);

  // Auto-join when phase flips to joining.
  useEffect(() => {
    if (phase !== "joining" || !walletAddress) return;
    let cancelled = false;
    (async () => {
      setErrorMsg(null);
      try {
        const data = await api.post<{
          quizId: string;
          roomPlayerId: string;
          userId: string;
        }>(`/rooms/${code}/join`, { walletAddress });
        if (cancelled) return;
        setRoomPlayerId(data.roomPlayerId);
        setPhase("waiting_lobby");
      } catch (e) {
        if (cancelled) return;
        const code2 = e instanceof ApiError ? e.code : undefined;
        if (code2 === "PRE_LOBBY") setPhase("pre_lobby");
        else if (code2 === "LATE" || code2 === "CLOSED") setPhase("closed");
        else if (code2 === "NEEDS_ONBOARDING") setPhase("needs_onboarding");
        else {
          setErrorMsg(e instanceof Error ? e.message : "Could not join");
          setPhase("room_missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, walletAddress, code]);

  // ---------------- SSE ----------------
  useRoomEvents(
    phase === "waiting_lobby" || phase === "playing" || phase === "finished" ? code : null,
    (event: RoomEvent) => {
      switch (event.type) {
        case "quiz_started":
          setQuiz((prev) =>
            prev
              ? { ...prev, status: "LIVE", startedAt: event.startedAt, endedAt: event.endsAt }
              : prev,
          );
          setPhase((p) => (p === "waiting_lobby" ? "playing" : p));
          break;
        case "quiz_ended":
          setQuiz((prev) =>
            prev ? { ...prev, status: "ENDED", endedAt: event.endedAt } : prev,
          );
          setPhase((p) => (p === "playing" ? "finished" : p));
          break;
        case "leaderboard":
          setLeaderboardRows(event.rows);
          break;
        case "payout_approved":
        case "payout_confirmed": {
          const payout: PublicPayout = {
            id: event.payoutId,
            rank: event.rank,
            amount: event.amount,
            tokenAddress: "",
            status: event.type === "payout_confirmed" ? "CONFIRMED" : "BROADCAST",
            txHash: event.txHash,
            confirmedAt: event.type === "payout_confirmed" ? new Date().toISOString() : null,
            userId: event.userId,
            displayName: "",
            walletAddress: null,
          };
          setPayouts((prev) => {
            const without = prev.filter(
              (p) => !(p.rank === payout.rank && p.userId === payout.userId),
            );
            return [...without, payout];
          });
          if (event.type === "payout_confirmed" && event.userId === userId) {
            setCelebrationPayout(payout);
            fireConfetti();
          }
          break;
        }
        default:
          break;
      }
    },
  );

  // When the quiz ends, pull a fresh profile so totalXp / level / badges
  // are current on the home and profile tabs without a reload.
  useEffect(() => {
    if (phase !== "finished") return;
    void refreshProfile();
  }, [phase, refreshProfile]);

  // Reset per-question state when index changes.
  useEffect(() => {
    if (phase !== "playing" || !questions) return;
    setSelectedChoiceId(null);
    setAnswerResult(null);
    setResolving(false);
    setQuestionStartedAt(Date.now());
    countdownFiredRef.current = false;
  }, [currentIndex, phase, questions]);

  // 100ms ticker to drive the per-question time-left bar.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setTimerTick(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const currentQuestion = useMemo<PublicQuestion | null>(() => {
    if (!questions) return null;
    return questions[currentIndex] ?? null;
  }, [questions, currentIndex]);

  const advanceToNext = useCallback(() => {
    if (!questions) return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    if (currentIndex >= questions.length - 1) setPhase("finished");
    else setCurrentIndex((i) => i + 1);
  }, [currentIndex, questions]);

  const submitAnswer = useCallback(
    async (choiceId: string) => {
      if (!roomPlayerId || !currentQuestion || !walletAddress || resolving)
        return;
      // Lock the picked tile + dim siblings IMMEDIATELY. The render below this
      // line happens before the network round trip, which kills the perceived
      // 2-3s latency the user complained about.
      setResolving(true);
      setSelectedChoiceId(choiceId);
      // Light haptic — MiniPay's WebView supports it. Cheap, instant feedback.
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(15);
        } catch {
          // Some browsers reject vibrate without user-gesture; we already had one.
        }
      }
      const clickedAt = Date.now();
      const timeTakenMs = clickedAt - questionStartedAt;
      // Schedule the advance from click time, NOT response time, so feedback
      // duration is consistent regardless of network latency. Network slowness
      // eats into the feedback hold instead of bleeding into the next question.
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(advanceToNext, FEEDBACK_HOLD_MS);
      try {
        const data = await api.post<{ isCorrect: boolean; points: number }>(
          `/rooms/${code}/answer`,
          {
            walletAddress,
            roomPlayerId,
            questionId: currentQuestion.id,
            choiceId,
            timeTakenMs,
          },
        );
        setAnswerResult(data);
        if (data.isCorrect) {
          setCorrectCount((c) => c + 1);
          setStreak((s) => s + 1);
          fireConfetti();
        } else {
          setStreak(0);
        }
        setTotalPoints((p) => p + (data.points || 0));
      } catch (e) {
        // The server rejected — show "didn't register" feedback so the user
        // knows their tap was lost, then move on. Common cases: STALE
        // (deadline passed), WALLET_MISMATCH (shouldn't happen on real
        // hardware), ALREADY_ANSWERED (race with auto-submit).
        if (e instanceof ApiError && e.code === "ALREADY_ANSWERED") {
          // Treat as a no-op — server already has our answer; don't alarm.
          setAnswerResult({ isCorrect: false, points: 0 });
        } else {
          setAnswerResult({ isCorrect: false, points: 0 });
        }
      }
    },
    [
      advanceToNext,
      code,
      currentQuestion,
      questionStartedAt,
      quiz?.questionTimeMs,
      resolving,
      roomPlayerId,
      walletAddress,
    ],
  );

  // Question-time-up: auto-submit empty.
  // Gate on questionStartedAt > 0: the reset effect runs in the same render as
  // phase→"playing" but its setState hasn't applied yet on the first pass,
  // so this effect would otherwise read 0 and instantly fire submitAnswer("")
  // — which advanced past Q1 before the player saw it.
  useEffect(() => {
    if (phase !== "playing" || !currentQuestion || questionStartedAt === 0) return;
    const deadline = questionStartedAt + (quiz?.questionTimeMs ?? 15_000);
    const left = deadline - Date.now();
    if (left <= 0 && !resolving && !selectedChoiceId && !countdownFiredRef.current) {
      countdownFiredRef.current = true;
      void submitAnswer("");
    }
  }, [
    phase,
    timerTick,
    currentQuestion,
    questionStartedAt,
    quiz?.questionTimeMs,
    resolving,
    selectedChoiceId,
    submitAnswer,
  ]);

  // Polling fallback for SSE drops + initial leaderboard hydrate.
  useEffect(() => {
    if (!roomPlayerId) return;
    let cancelled = false;
    async function tick() {
      try {
        const [quizRes, lbRes, payoutRes] = await Promise.all([
          api.get<{ quiz: PublicQuiz; questions: PublicQuestion[] }>(
            `/quizzes/${code}`,
          ),
          api.get<{ rows: LeaderboardRow[] }>(`/rooms/${code}/leaderboard`),
          api.get<{ payouts: PublicPayout[] }>(`/rooms/${code}/payouts`),
        ]);
        if (cancelled) return;
        setQuiz(quizRes.quiz);
        setLeaderboardRows(lbRes.rows);
        setPayouts(payoutRes.payouts);
        if (quizRes.quiz.status === "LIVE") {
          setPhase((p) => (p === "waiting_lobby" ? "playing" : p));
        } else if (quizRes.quiz.status === "ENDED") {
          setPhase((p) =>
            p === "waiting_lobby" || p === "playing" ? "finished" : p,
          );
        }
      } catch {
        // non-fatal
      }
    }
    void tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomPlayerId, code]);

  const myRank = useMemo(() => {
    if (!userId) return null;
    const i = leaderboardRows.findIndex((r) => r.userId === userId);
    return i >= 0 ? i + 1 : null;
  }, [leaderboardRows, userId]);

  const myRow = useMemo(() => {
    if (!userId) return null;
    return leaderboardRows.find((r) => r.userId === userId) ?? null;
  }, [leaderboardRows, userId]);

  // ---------------- Render ----------------

  if (phase === "booting") return <BootingScreen />;
  if (phase === "gate") return <MiniPayGate targetUrl={pageUrl} />;
  if (phase === "needs_onboarding") {
    // Redirect; render a loader meanwhile.
    if (typeof window !== "undefined") router.replace("/onboarding");
    return <BootingScreen />;
  }
  if (phase === "room_missing") return <RoomMissing code={code} message={errorMsg} />;
  if (phase === "closed") return <QuizClosedScreen leaderboardRows={leaderboardRows} />;
  if (phase === "pre_lobby" && quiz?.scheduledStart) {
    return <PreLobbyScreen quiz={quiz} />;
  }
  if (phase === "joining") return <BootingScreen label="Joining…" />;
  if (phase === "waiting_lobby" && quiz) {
    return (
      <LobbyScreen
        quiz={quiz}
        leaderboardRows={leaderboardRows}
        viewerProfile={profile}
        viewerUserId={userId}
      />
    );
  }
  if (phase === "playing" && quiz && currentQuestion) {
    return (
      <QuestionScreen
        quiz={quiz}
        question={currentQuestion}
        index={currentIndex}
        total={questions?.length ?? 0}
        questionStartedAt={questionStartedAt}
        selectedChoiceId={selectedChoiceId}
        answerResult={answerResult}
        streak={streak}
        timerTick={timerTick}
        onPick={(id) => {
          if (resolving) return;
          void submitAnswer(id);
        }}
      />
    );
  }
  if (phase === "playing") return <BootingScreen label="Loading question…" />;
  // phase === "finished"
  return (
    <ResultsScreen
      myRank={myRank}
      myRow={myRow}
      totalPlayers={leaderboardRows.length}
      correctCount={correctCount}
      totalPoints={totalPoints}
      leaderboardRows={leaderboardRows}
      payouts={payouts}
      celebrationPayout={celebrationPayout}
      viewerUserId={userId}
    />
  );
}

// ============== Screens ==============

function BootingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main
      className="mq-screen"
      style={{
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Mango pose="think" size={120} />
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 14,
          color: "var(--ink-soft)",
          letterSpacing: 0.1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
    </main>
  );
}

function RoomMissing({ code, message }: { code: string; message: string | null }) {
  return (
    <main
      className="mq-screen"
      style={{
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <MQCard style={{ width: "100%", maxWidth: 440, padding: 24, textAlign: "center" }}>
        <Mango pose="sad" size={120} />
        <h1 className="mq-h2" style={{ marginTop: 8 }}>Quiz not found</h1>
        <p className="mq-body" style={{ fontSize: 13, marginTop: 4 }}>
          {message ?? `We couldn't find quiz "${code}".`}
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/">
            <MQButton block size="lg">See upcoming quizzes</MQButton>
          </Link>
        </div>
      </MQCard>
    </main>
  );
}

function QuizClosedScreen({ leaderboardRows }: { leaderboardRows: LeaderboardRow[] }) {
  const top5 = leaderboardRows.slice(0, 5);
  return (
    <main
      className="mq-screen"
      style={{ minHeight: "100dvh", padding: 16, alignItems: "center" }}
    >
      <MQCard style={{ width: "100%", maxWidth: 440, padding: 24, textAlign: "center" }}>
        <Mango pose="sad" size={120} />
        <h1 className="mq-h2" style={{ marginTop: 8 }}>Quiz closed</h1>
        <p className="mq-body" style={{ fontSize: 13, marginTop: 4 }}>
          This quiz has already started or ended. Catch the next one!
        </p>
        {top5.length > 0 && (
          <div style={{ marginTop: 16, textAlign: "left" }}>
            <div className="mq-eyebrow" style={{ marginBottom: 8 }}>Top players</div>
            {top5.map((r, i) => (
              <div
                key={r.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderTop: i === 0 ? undefined : "1px solid var(--line)",
                }}
              >
                <span className="mq-num" style={{ fontFamily: "var(--font-display)", fontWeight: 900, width: 24, color: "var(--ink-soft)" }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14 }}>
                  {r.displayName}
                </span>
                <span className="mq-num" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14 }}>
                  {r.points}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Link href="/">
            <MQButton block size="lg">Upcoming quizzes</MQButton>
          </Link>
        </div>
      </MQCard>
    </main>
  );
}

function PreLobbyScreen({ quiz }: { quiz: PublicQuiz }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const startMs = quiz.scheduledStart ? new Date(quiz.scheduledStart).getTime() : 0;
  const lobbyOpenMs = startMs - 5 * 60_000;
  const msToLobby = Math.max(0, lobbyOpenMs - now);

  return (
    <main
      className="mq-screen"
      style={{ minHeight: "100dvh", padding: 16, alignItems: "center" }}
    >
      <MQCard style={{ width: "100%", maxWidth: 440, padding: 24, textAlign: "center" }}>
        <Mango pose="sleep" size={120} />
        <h1 className="mq-h2" style={{ marginTop: 8 }}>{quiz.title}</h1>
        <p className="mq-body" style={{ fontSize: 13, marginTop: 4 }}>
          Lobby opens 5 minutes before the quiz starts.
        </p>
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 22,
            background: "linear-gradient(135deg, var(--accent), var(--berry))",
            color: "white",
            border: "2px solid var(--accent-shade)",
            boxShadow: "0 4px 0 0 var(--accent-shade)",
          }}
        >
          <div className="mq-eyebrow" style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
            Lobby opens in
          </div>
          <div
            className="mq-num"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 56,
              lineHeight: 1,
              textShadow: "0 4px 0 rgba(0,0,0,0.18)",
            }}
          >
            {formatCountdown(msToLobby)}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, opacity: 0.92 }}>
            Quiz starts at {new Date(quiz.scheduledStart!).toLocaleString()}
          </div>
        </div>
        <p className="mq-body" style={{ fontSize: 12, marginTop: 16 }}>
          Keep this tab open — we&apos;ll let you in automatically when the lobby opens.
        </p>
      </MQCard>
    </main>
  );
}

function LobbyScreen({
  quiz,
  leaderboardRows,
  viewerProfile,
  viewerUserId,
}: {
  quiz: PublicQuiz;
  leaderboardRows: LeaderboardRow[];
  viewerProfile: { displayName: string | null; avatarEmoji: string | null; avatarColor: string | null } | null;
  viewerUserId: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const startMs = quiz.scheduledStart ? new Date(quiz.scheduledStart).getTime() : 0;
  const left = Math.max(0, startMs - now);
  const totalUsdt = quiz.prizeAmounts.reduce((s, a) => s + Number(a || 0), 0);

  // Show the first 8 players + a "+N more" line. Move the viewer to the front.
  const players = useMemo(() => {
    const list = [...leaderboardRows];
    if (viewerUserId) {
      const i = list.findIndex((r) => r.userId === viewerUserId);
      if (i > 0) list.unshift(list.splice(i, 1)[0]!);
    }
    return list;
  }, [leaderboardRows, viewerUserId]);
  const top = players.slice(0, 8);
  const more = Math.max(0, (quiz.playerCount ?? players.length) - top.length);

  return (
    <main className="mq-screen" style={{ minHeight: "100dvh", padding: "12px 0 16px" }}>
      <Header title={quiz.title} backHref="/" />

      <div
        style={{
          padding: "0 16px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "var(--card)",
              border: "4px solid var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 0 0 var(--primary-shade)",
            }}
          >
            <div className={left < 10_000 ? "mq-pulse" : ""}>
              <div
                className="mq-h1 mq-num"
                style={{ fontSize: 56, color: "var(--primary)", lineHeight: 1 }}
              >
                {formatCountdown(left)}
              </div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              background: "var(--accent)",
              color: "white",
              padding: "4px 10px",
              borderRadius: 999,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 11,
              border: "2px solid white",
            }}
          >
            STARTING
          </div>
        </div>
        <h2 className="mq-h2" style={{ marginTop: 4 }}>Ready up!</h2>
        <p className="mq-body" style={{ fontSize: 14 }}>
          Quiz starts in {formatSecondsHuman(left)}
        </p>
      </div>

      <div
        style={{
          padding: "16px 16px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="mq-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="people" size={11} /> {quiz.playerCount} JOINED
        </span>
        <Pill style={{ fontSize: 11, padding: "4px 10px", color: "var(--accent-shade)", borderColor: "var(--accent)" }}>
          ${totalUsdt} USDT
        </Pill>
      </div>

      <div style={{ padding: "0 16px", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {top.map((p) => {
            const me = p.userId === viewerUserId;
            // Viewer's avatar comes from their live profile (covers the case
            // where their username/avatar was just set and the leaderboard
            // hasn't refreshed yet); peers come from the row payload.
            const emoji = me ? viewerProfile?.avatarEmoji ?? p.avatarEmoji : p.avatarEmoji;
            const color = me ? viewerProfile?.avatarColor ?? p.avatarColor : p.avatarColor;
            return (
              <div
                key={p.userId}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
              >
                <Avatar
                  emoji={emoji}
                  color={color}
                  size={48}
                  ring={me ? "var(--primary)" : null}
                  fallback={p.displayName[0]?.toUpperCase() ?? "•"}
                />
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: "var(--font-display)",
                    textAlign: "center",
                    maxWidth: 64,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.displayName}
                </div>
              </div>
            );
          })}
        </div>
        {more > 0 && (
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--ink-soft)",
              fontWeight: 700,
              marginTop: 12,
            }}
          >
            + {more} more joining…
          </div>
        )}
      </div>

      <div style={{ padding: "12px 20px 24px" }}>
        <MQButton block size="lg" disabled>
          <Icon name="check" size={18} color="white" /> You&apos;re in
        </MQButton>
      </div>
    </main>
  );
}

function QuestionScreen({
  quiz,
  question,
  index,
  total,
  questionStartedAt,
  selectedChoiceId,
  answerResult,
  streak,
  timerTick,
  onPick,
}: {
  quiz: PublicQuiz;
  question: PublicQuestion;
  index: number;
  total: number;
  questionStartedAt: number;
  selectedChoiceId: string | null;
  answerResult: { isCorrect: boolean; points: number } | null;
  streak: number;
  timerTick: number;
  onPick: (choiceId: string) => void;
}) {
  void timerTick; // re-render driver
  const elapsed = Date.now() - questionStartedAt;
  const left = Math.max(0, (quiz.questionTimeMs ?? 15_000) - elapsed);
  const pct = (left / (quiz.questionTimeMs ?? 15_000)) * 100;
  const timeColor =
    pct > 60 ? "var(--primary)" : pct > 30 ? "var(--accent)" : "var(--wrong)";
  // Three states for choice tiles:
  //   - idle: no pick yet → all tiles tappable
  //   - locked: user tapped, server response not in yet → picked tile shows
  //     a neutral pressed look + checkmark, others disabled + dimmed
  //   - resolved: server returned → picked tile turns green/red, correct
  //     answer revealed if user was wrong
  const isLocked = selectedChoiceId !== null;
  const isResolved = answerResult !== null;
  const showFeedback = isResolved;
  const correctChoiceId = answerResult?.isCorrect ? selectedChoiceId : null;
  const wrongChoiceId =
    answerResult && !answerResult.isCorrect ? selectedChoiceId : null;

  return (
    <main
      className="mq-screen"
      style={{ minHeight: "100dvh", padding: "12px 0 16px", display: "flex", flexDirection: "column" }}
    >
      <div style={{ padding: "8px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Link
            href="/"
            aria-label="Leave quiz"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "var(--card)",
              border: "2px solid var(--line)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={16} color="var(--ink-soft)" />
          </Link>
          <div style={{ flex: 1 }}>
            <ProgressBar pct={pct} color={timeColor} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 13,
              color: timeColor,
            }}
          >
            <Icon name="clock" size={14} color={timeColor} />
            {(left / 1000).toFixed(1)}s
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 11,
            color: "var(--ink-soft)",
            letterSpacing: 0.1,
          }}
        >
          <span>Q {index + 1} / {total}</span>
          <span style={{ color: "var(--primary)" }}>
            {showFeedback
              ? answerResult.isCorrect
                ? `+${answerResult.points} POINTS`
                : "+0 POINTS"
              : isLocked
                ? "LOCKED IN…"
                : "FAST = MORE PTS"}
          </span>
        </div>
      </div>

      <div style={{ padding: "8px 16px 16px" }}>
        <MQCard style={{ padding: "20px 20px 18px", textAlign: "center", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: -16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--berry)",
              color: "white",
              padding: "4px 14px",
              borderRadius: 999,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 11,
              border: "3px solid var(--bg)",
            }}
          >
            QUESTION {index + 1}
          </div>
          <h2 className="mq-h2" style={{ fontSize: 22, lineHeight: 1.25, marginTop: 4 }}>
            {question.prompt}
          </h2>
          {showFeedback && (
            <div
              style={{
                marginTop: 14,
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                background: answerResult.isCorrect ? "var(--primary)" : "var(--wrong)",
                padding: "8px 14px",
                borderRadius: 999,
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 13,
                color: "white",
              }}
            >
              <Icon
                name={answerResult.isCorrect ? "check" : "x"}
                size={14}
                color="white"
                strokeWidth={4}
              />
              {answerResult.isCorrect
                ? `CORRECT · +${answerResult.points}`
                : "MISSED"}
            </div>
          )}
        </MQCard>
      </div>

      <div
        style={{
          padding: "0 16px",
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          gridAutoRows: "min-content",
        }}
      >
        {question.choices.map((c, i) => {
          const letter = LETTERS[i] ?? String(i + 1);
          const accent = CHOICE_COLORS[i % CHOICE_COLORS.length];
          const isPicked = c.id === selectedChoiceId;
          const isCorrect = c.id === correctChoiceId;
          const isWrong = c.id === wrongChoiceId;

          let chrome: React.CSSProperties = {
            background: "var(--card)",
            border: "2px solid var(--line)",
            boxShadow: "0 4px 0 0 var(--line)",
            color: "var(--ink)",
          };
          if (showFeedback) {
            if (isCorrect) {
              chrome = {
                background: "var(--primary)",
                border: "2px solid var(--primary-shade)",
                boxShadow: "0 4px 0 0 var(--primary-shade)",
                color: "white",
              };
            } else if (isWrong) {
              chrome = {
                background: "var(--wrong)",
                border: "2px solid var(--wrong-shade)",
                boxShadow: "0 4px 0 0 var(--wrong-shade)",
                color: "white",
              };
            } else {
              chrome = {
                background: "var(--card)",
                border: "2px solid var(--line)",
                boxShadow: "0 4px 0 0 var(--line)",
                opacity: 0.45,
                color: "var(--ink)",
              };
            }
          } else if (isLocked) {
            // Optimistic: tap registered, awaiting server. Picked tile gets
            // a pressed-in look in its accent color so the user sees a beat.
            // Sibling tiles dim out so they look "out of contention".
            if (isPicked) {
              chrome = {
                background: accent,
                border: `2px solid ${accent}`,
                boxShadow: "0 1px 0 0 rgba(0,0,0,0.15)",
                color: "white",
                transform: "translateY(2px)",
              };
            } else {
              chrome = {
                background: "var(--card)",
                border: "2px solid var(--line)",
                boxShadow: "0 4px 0 0 var(--line)",
                opacity: 0.45,
                color: "var(--ink)",
              };
            }
          }

          return (
            <button
              key={c.id}
              onClick={() => !isLocked && !showFeedback && onPick(c.id)}
              disabled={isLocked || showFeedback}
              className="mq-press"
              style={{
                ...chrome,
                borderRadius: 18,
                padding: "16px 12px",
                minHeight: 100,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
                position: "relative",
                cursor: isLocked || showFeedback ? "default" : "pointer",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 17,
                textAlign: "left",
                transition: "transform 80ms ease, box-shadow 80ms ease, background 120ms ease",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: showFeedback && (isCorrect || isWrong)
                    ? "rgba(255,255,255,0.25)"
                    : accent,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  boxShadow: "inset 0 -3px 0 0 rgba(0,0,0,0.18)",
                }}
              >
                {letter}
              </div>
              <span style={{ fontSize: 17 }}>{c.label}</span>
              {showFeedback && (isCorrect || isWrong) && (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={isCorrect ? "check" : "x"}
                    size={14}
                    color={isCorrect ? "var(--primary-shade)" : "var(--wrong-shade)"}
                    strokeWidth={4}
                  />
                </span>
              )}
              {isLocked && !showFeedback && isPicked && (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.85)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="check" size={14} color={accent} strokeWidth={4} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: "12px 20px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: 56,
        }}
      >
        {showFeedback ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 12px",
              background: "var(--card)",
              border: "2px solid var(--line)",
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mango pose={answerResult!.isCorrect ? "cheer" : "sad"} size={36} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 13 }}>
                {answerResult!.isCorrect ? `Streak: ${streak}x` : "Streak reset"}
              </span>
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              Next…
            </span>
          </div>
        ) : (
          <>
            <Pill style={{ fontSize: 12, padding: "6px 10px" }}>
              <Icon name="lightning" size={12} color="var(--accent)" /> Faster = more
            </Pill>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 14,
                color: "var(--ink)",
              }}
            >
              <Icon name="flame" size={16} color="var(--accent)" /> {streak}x streak
            </span>
          </>
        )}
      </div>
    </main>
  );
}

function ResultsScreen({
  myRank,
  myRow,
  totalPlayers,
  correctCount,
  totalPoints,
  leaderboardRows,
  payouts,
  celebrationPayout,
  viewerUserId,
}: {
  myRank: number | null;
  myRow: LeaderboardRow | null;
  totalPlayers: number;
  correctCount: number;
  totalPoints: number;
  leaderboardRows: LeaderboardRow[];
  payouts: PublicPayout[];
  celebrationPayout: PublicPayout | null;
  viewerUserId: string | null;
}) {
  const top3 = leaderboardRows.slice(0, 3);
  const isWinner = myRank !== null && myRank <= 3;

  return (
    <main
      className="mq-screen"
      style={{ minHeight: "100dvh", padding: "16px 0 24px", overflow: "hidden" }}
    >
      {/* Header */}
      <div style={{ padding: "8px 16px 0", textAlign: "center", position: "relative" }}>
        <Mango pose={isWinner ? "cheer" : "wave"} size={120} className="mq-bob" />
        {isWinner && celebrationPayout?.status === "CONFIRMED" ? (
          <h1 className="mq-h1" style={{ fontSize: 28, marginTop: 4 }}>
            You won ${formatPrize(celebrationPayout.amount)} USDT!
          </h1>
        ) : isWinner ? (
          <h1 className="mq-h1" style={{ fontSize: 28, marginTop: 4 }}>
            You finished {ordinal(myRank!)}!
          </h1>
        ) : myRank ? (
          <h1 className="mq-h1" style={{ fontSize: 28, marginTop: 4 }}>
            You placed #{myRank}
          </h1>
        ) : (
          <h1 className="mq-h1" style={{ fontSize: 28, marginTop: 4 }}>
            Quiz over
          </h1>
        )}
        <p className="mq-body" style={{ fontSize: 14, marginTop: 4 }}>
          {myRank
            ? `${ordinal(myRank)} of ${totalPlayers} players`
            : "Hang tight — scoring up…"}
        </p>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div
          style={{
            padding: "16px 16px 0",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* Visual order silver-gold-bronze. `i` is the rank index in top3
              (0 = gold, 1 = silver, 2 = bronze); pass `i + 1` as the rank so
              the podium height + medal colour stay correct. */}
          {[1, 0, 2].map((i) => {
            const r = top3[i];
            if (!r) return <div key={i} style={{ flex: 1 }} />;
            return (
              <PodiumStack
                key={r.userId}
                rank={(i + 1) as 1 | 2 | 3}
                name={r.displayName}
                score={r.points.toString()}
                me={r.userId === viewerUserId}
                amount={payouts.find((p) => p.userId === r.userId)?.amount}
                avatarEmoji={r.avatarEmoji}
                avatarColor={r.avatarColor}
              />
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          padding: "20px 16px 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <StatTile
          label="ACCURACY"
          value={
            myRow && myRow.answeredCount > 0
              ? `${Math.round((myRow.correctCount / myRow.answeredCount) * 100)}%`
              : `${correctCount > 0 ? "—" : "0"}`
          }
          icon="check"
          color="var(--primary)"
        />
        <StatTile
          label="POINTS"
          value={(myRow?.points ?? totalPoints).toLocaleString()}
          icon="lightning"
          color="var(--accent)"
        />
        <StatTile
          label="XP"
          value={`+${myRow?.points ?? totalPoints}`}
          icon="gem"
          color="var(--sky)"
        />
      </div>

      {/* Payout celebration */}
      <AnimatePresence>
        {celebrationPayout?.status === "CONFIRMED" && celebrationPayout.txHash && (
          <motion.div
            key={celebrationPayout.txHash}
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            style={{
              margin: "8px 16px 0",
              borderRadius: 22,
              padding: 16,
              textAlign: "center",
              color: "white",
              background: "linear-gradient(135deg, var(--primary), var(--sky))",
              border: "2px solid var(--primary-shade)",
              boxShadow: "0 4px 0 0 var(--primary-shade)",
            }}
          >
            <div className="mq-h2" style={{ color: "white", fontSize: 22 }}>
              {formatPrize(celebrationPayout.amount)} USDT sent to your wallet
            </div>
            <a
              href={BLOCKSCOUT_TX(celebrationPayout.txHash)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                background: "white",
                color: "var(--primary-shade)",
                padding: "6px 14px",
                borderRadius: 999,
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              View on Blockscout ✓
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/">
          <MQButton block size="lg">
            <Icon name="play" size={16} color="white" /> Back to home
          </MQButton>
        </Link>
        <Link href="/leaderboard">
          <MQButton block size="md" variant="ghost">
            <Icon name="trophy" size={14} color="var(--ink)" /> See global ranks
          </MQButton>
        </Link>
      </div>
    </main>
  );
}

function PodiumStack({
  rank,
  name,
  score,
  me,
  amount,
  avatarEmoji,
  avatarColor,
}: {
  rank: 1 | 2 | 3 | number;
  name: string;
  score: string;
  me: boolean;
  amount?: string;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
}) {
  const heights: Record<number, number> = { 1: 120, 2: 90, 3: 70 };
  const podColor = rank === 1 ? "var(--gold)" : rank === 2 ? "#C0C7CE" : "#D49E5C";
  // Fall back to a rank-tinted disc when the player hasn't onboarded yet.
  const fallbackColor = rank === 1 ? "sky" : rank === 2 ? "accent" : "berry";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, maxWidth: 110 }}>
      {rank === 1 && (
        <div style={{ marginBottom: 4 }}>
          <Icon name="crown" size={28} color="var(--gold)" />
        </div>
      )}
      <Avatar
        emoji={avatarEmoji ?? null}
        color={avatarColor ?? fallbackColor}
        fallback={name[0]?.toUpperCase()}
        size={50}
        ring={me ? "var(--primary)" : "white"}
      />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 13, marginTop: 6, textAlign: "center", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </div>
      <div className="mq-num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>
        {score}
      </div>
      <div
        style={{
          width: "100%",
          height: heights[rank] ?? 60,
          background: podColor,
          borderRadius: "14px 14px 0 0",
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 8,
          color: "white",
          fontFamily: "var(--font-display)",
          boxShadow: "inset 0 -6px 0 0 rgba(0,0,0,0.15)",
          border: "2px solid rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{rank}</div>
        {amount && (
          <div style={{ fontSize: 11, fontWeight: 900, marginTop: 4 }}>${formatPrize(amount)}</div>
        )}
      </div>
    </div>
  );
}

function Header({ title, backHref }: { title: string; backHref: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px 12px",
      }}
    >
      <Link
        href={backHref}
        aria-label="Back"
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: "var(--card)",
          border: "2px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 0 0 var(--line)",
        }}
      >
        <Icon name="arrow-left" size={18} color="var(--ink)" />
      </Link>
      <div className="mq-h3" style={{ flex: 1, textAlign: "center" }}>
        {title}
      </div>
      <div style={{ width: 36 }} />
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

function formatSecondsHuman(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec} seconds`;
  const m = Math.floor(sec / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// Avoid an unused-import warning on `msUntil` if we ever stop using it.
void msUntil;
