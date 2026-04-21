"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BigButton } from "@/components/BigButton";
import { Countdown } from "@/components/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { Mascot } from "@/components/Mascot";
import { PayoutButton } from "@/components/PayoutButton";
import { Podium } from "@/components/Podium";
import { QRDisplay } from "@/components/QRDisplay";
import type { LeaderboardRow, RoomEvent } from "@/lib/events";

type RoomStatus = "lobby" | "live" | "ended";

type Room = {
  id: string;
  status: RoomStatus;
  startedAt: number | null;
  endsAt: number | null;
  durationMs: number;
  questionTimeMs: number;
  prizeAmounts: string[];
  playerCount: number;
};

type Payout = {
  rank: number;
  playerId: string;
  amount: string;
  txHash: string;
  confirmed: boolean;
};

type LobbyPlayer = { playerId: string; name: string };

type Toast = { id: number; text: string };

const AVATAR_EMOJIS = [
  "🦎", "🐙", "🦊", "🐼", "🐵", "🦉", "🦄", "🐸",
  "🐯", "🐨", "🦁", "🐶", "🐱", "🐰", "🦀", "🐳",
];

const GRADIENTS = [
  "from-duo-green to-duo-blue",
  "from-duo-yellow to-duo-orange",
  "from-duo-red to-duo-purple",
  "from-duo-blue to-duo-purple",
  "from-duo-orange to-duo-red",
  "from-celo-yellow to-duo-green",
  "from-duo-purple to-duo-blue",
  "from-duo-green to-celo-yellow",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function HostProjectorPage({
  params,
}: {
  params: { roomId: string };
}) {
  const { roomId } = params;

  const [room, setRoom] = useState<Room | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [podiumDone, setPodiumDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const toastSeqRef = useRef(0);
  const endPostedRef = useRef(false);

  // Safety: if room is ended and the podium reveal never fires (e.g. host
  // refreshed mid-ceremony), force podiumDone after 8s so payout buttons
  // always appear.
  useEffect(() => {
    if (room?.status !== "ended" || podiumDone) return;
    const t = setTimeout(() => setPodiumDone(true), 8000);
    return () => clearTimeout(t);
  }, [room?.status, podiumDone]);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return `/play/${roomId}`;
    return `${window.location.origin}/play/${roomId}`;
  }, [roomId]);

  // Initial hydrate + 2.5s polling fallback. The SSE broker is in-memory
  // per serverless instance, so polling keeps the projector honest even if
  // broadcasts land on a different instance.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const [roomRes, lbRes, payRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/leaderboard`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/payout`, { cache: "no-store" }),
        ]);

        if (roomRes.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!roomRes.ok) throw new Error(`Room ${roomRes.status}`);

        const roomData = (await roomRes.json()) as Room & {
          players?: LobbyPlayer[];
        };
        const lbData = lbRes.ok
          ? ((await lbRes.json()) as { rows: LeaderboardRow[] })
          : { rows: [] };
        const payData = payRes.ok
          ? ((await payRes.json()) as {
              payouts: {
                rank: number;
                playerId: string;
                amount: string;
                txHash: string;
                confirmedAt: number | null;
              }[];
            })
          : { payouts: [] };

        if (cancelled) return;
        setRoom(roomData);
        if (roomData.players?.length) {
          setLobbyPlayers(
            roomData.players.map((p) => ({ playerId: p.playerId, name: p.name }))
          );
        }
        setRows(lbData.rows);
        setPayouts(
          payData.payouts.map((p) => ({
            rank: p.rank,
            playerId: p.playerId,
            amount: p.amount,
            txHash: p.txHash,
            confirmed: p.confirmedAt != null,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load room");
        }
      }
    }

    tick();
    const interval = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  // SSE subscription (opens after first hydrate attempt completes — we just attach here)
  useEffect(() => {
    if (notFound) return;
    const es = new EventSource(`/api/rooms/${roomId}/events`);

    es.onmessage = (msg) => {
      let event: RoomEvent;
      try {
        event = JSON.parse(msg.data) as RoomEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "player_joined":
          setLobbyPlayers((prev) => {
            if (prev.some((p) => p.playerId === event.playerId)) return prev;
            const next = [...prev, { playerId: event.playerId, name: event.name }];
            setRoom((r) => (r ? { ...r, playerCount: next.length } : r));
            return next;
          });
          break;
        case "room_started":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  status: "live",
                  startedAt: event.startedAt,
                  endsAt: event.endsAt,
                }
              : prev
          );
          break;
        case "leaderboard":
          setRows(event.rows);
          break;
        case "answer_submitted": {
          if (!event.isCorrect) break;
          const id = ++toastSeqRef.current;
          const text = `${event.name} got Q${event.questionPosition + 1}! 🎯`;
          setToasts((prev) => [...prev, { id, text }]);
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          }, 1500);
          break;
        }
        case "room_ended":
          setRoom((prev) => (prev ? { ...prev, status: "ended" } : prev));
          break;
        case "payout_sent":
        case "payout_confirmed":
          setPayouts((prev) => {
            const idx = prev.findIndex(
              (p) => p.rank === event.rank && p.playerId === event.playerId
            );
            const next: Payout = {
              rank: event.rank,
              playerId: event.playerId,
              amount: event.amount,
              txHash: event.txHash,
              confirmed: event.type === "payout_confirmed",
            };
            if (idx === -1) return [...prev, next];
            const copy = prev.slice();
            copy[idx] = { ...copy[idx], ...next, confirmed: next.confirmed || copy[idx].confirmed };
            return copy;
          });
          break;
      }
    };

    es.onerror = () => {
      // let browser auto-reconnect
    };

    return () => {
      es.close();
    };
  }, [roomId, notFound]);

  const handleStart = useCallback(async () => {
    if (!room || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/start`, { method: "POST" });
      if (!res.ok) throw new Error(`Start failed (${res.status})`);
      const data = (await res.json()) as { startedAt: number; endsAt: number };
      setRoom((prev) =>
        prev
          ? { ...prev, status: "live", startedAt: data.startedAt, endsAt: data.endsAt }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }, [room, roomId, starting]);

  const handleCountdownDone = useCallback(async () => {
    if (endPostedRef.current) return;
    endPostedRef.current = true;
    try {
      await fetch(`/api/rooms/${roomId}/end`, { method: "POST" });
    } catch {
      // best-effort
    }
  }, [roomId]);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [roomId]);

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-duo-cream px-6 text-center">
        <Mascot mood="sad" size={120} />
        <h1 className="font-display text-5xl font-black text-duo-ink">
          Room not found
        </h1>
        <p className="max-w-md font-semibold text-duo-gray-dark">
          That room code doesn&apos;t exist. Create a new one to get started.
        </p>
        <a href="/host">
          <BigButton variant="green" size="lg">
            Create a Room
          </BigButton>
        </a>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream">
        <div className="flex flex-col items-center gap-4">
          <Mascot mood="thinking" size={96} />
          <p className="font-bold text-duo-gray-dark">
            {error ?? "Loading room…"}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-duo-cream">
      {room.status === "lobby" && (
        <LobbyView
          roomId={roomId}
          joinUrl={joinUrl}
          players={lobbyPlayers}
          playerCount={room.playerCount}
          starting={starting}
          onStart={handleStart}
          onCopyCode={handleCopyCode}
          copied={copied}
        />
      )}

      {room.status === "live" && room.endsAt && (
        <LiveView
          endsAt={room.endsAt}
          rows={rows}
          payouts={payouts}
          toasts={toasts}
          onCountdownDone={handleCountdownDone}
        />
      )}

      {room.status === "ended" && (
        <EndedView
          rows={rows}
          payouts={payouts}
          prizeAmounts={room.prizeAmounts}
          roomId={roomId}
          podiumDone={podiumDone}
          onPodiumReveal={() => setPodiumDone(true)}
        />
      )}
    </main>
  );
}

/* ---------------- Lobby ---------------- */

function LobbyView({
  roomId,
  joinUrl,
  players,
  playerCount,
  starting,
  onStart,
  onCopyCode,
  copied,
}: {
  roomId: string;
  joinUrl: string;
  players: LobbyPlayer[];
  playerCount: number;
  starting: boolean;
  onStart: () => void;
  onCopyCode: () => void;
  copied: boolean;
}) {
  const effectiveCount = Math.max(playerCount, players.length);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mascot mood="happy" size={64} />
          <div>
            <div className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
              Lobby
            </div>
            <div className="font-display text-3xl font-black text-duo-ink">
              Waiting for players…
            </div>
          </div>
        </div>
        <motion.div
          key={effectiveCount}
          initial={{ scale: 0.8, y: -4 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
          className="rounded-2xl border-2 border-duo-green bg-white px-4 py-2 text-center shadow-3d-sm"
        >
          <div className="text-3xl font-black tabular-nums text-duo-green">
            {effectiveCount}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-duo-gray-dark">
            {effectiveCount === 1 ? "player" : "players"}
          </div>
        </motion.div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,auto]">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
            Room Code
          </div>
          <button
            type="button"
            onClick={onCopyCode}
            className="group relative select-none"
            aria-label="Copy room code"
          >
            <div className="font-display text-[120px] font-black leading-none tracking-tight text-duo-ink transition-transform group-active:scale-[0.98] sm:text-[160px]">
              {roomId}
            </div>
            <div
              className={`mt-2 text-sm font-bold ${
                copied ? "text-duo-green" : "text-duo-gray-dark"
              }`}
            >
              {copied ? "Copied! ✓" : "Tap to copy"}
            </div>
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <QRDisplay url={joinUrl} size={320} />
          <p className="max-w-[360px] text-center text-sm font-semibold text-duo-gray-dark">
            Scan or visit <span className="font-black text-duo-ink">/join</span>{" "}
            and enter the code
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
          Players in lobby
        </h2>
        <div className="flex min-h-[64px] flex-wrap gap-2 rounded-3xl border-2 border-dashed border-duo-gray-light bg-white p-4">
          <AnimatePresence initial={false}>
            {players.map((p) => {
              const hash = hashString(p.playerId);
              const emoji = AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
              const gradient = GRADIENTS[hash % GRADIENTS.length];
              return (
                <motion.div
                  key={p.playerId}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="flex items-center gap-2 rounded-full border-2 border-duo-gray-light bg-duo-cream py-1 pl-1 pr-3 shadow-3d-sm"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-base`}
                    aria-hidden
                  >
                    {emoji}
                  </div>
                  <span
                    className="max-w-[10rem] truncate text-sm font-extrabold text-duo-ink"
                    title={p.name}
                  >
                    {p.name}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {players.length === 0 && (
            <div className="mx-auto self-center text-sm font-semibold text-duo-gray">
              No players yet — share the code!
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-center pt-4">
        <BigButton
          variant="green"
          size="xl"
          onClick={onStart}
          disabled={effectiveCount === 0 || starting}
          className="min-w-[280px]"
        >
          {starting ? "Starting…" : "Start Quiz 🚀"}
        </BigButton>
      </div>
    </div>
  );
}

/* ---------------- Live ---------------- */

function LiveView({
  endsAt,
  rows,
  payouts,
  toasts,
  onCountdownDone,
}: {
  endsAt: number;
  rows: LeaderboardRow[];
  payouts: Payout[];
  toasts: Toast[];
  onCountdownDone: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between gap-6">
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-xl bg-duo-red px-3 py-1.5 text-white shadow-3d-sm"
        >
          <span className="font-display text-sm font-black uppercase tracking-wider">
            Live ⚡
          </span>
        </motion.div>
        <Countdown to={endsAt} size="xl" onDone={onCountdownDone} />
      </header>

      <section className="rounded-3xl border-2 border-duo-gray-light bg-duo-cream p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-duo-gray-dark">
          Leaderboard
        </h2>
        {rows.length === 0 ? (
          <div className="py-12 text-center font-bold text-duo-gray-dark">
            Waiting for first answers…
          </div>
        ) : (
          <Leaderboard rows={rows} payouts={payouts} />
        )}
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="max-w-[90vw] truncate rounded-full border-2 border-duo-green-dark bg-duo-green px-5 py-2 font-extrabold text-white shadow-3d-green sm:max-w-md"
              title={t.text}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------- Ended ---------------- */

function EndedView({
  rows,
  payouts,
  prizeAmounts,
  roomId,
  podiumDone,
  onPodiumReveal,
}: {
  rows: LeaderboardRow[];
  payouts: Payout[];
  prizeAmounts: string[];
  roomId: string;
  podiumDone: boolean;
  onPodiumReveal: () => void;
}) {
  const top3 = rows.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <Mascot mood="winner" size={96} />
        <h1 className="font-display text-5xl font-black text-duo-ink">
          THE END 🎉
        </h1>
        <p className="font-bold text-duo-gray-dark">
          Thanks for playing MiniPay&apos;s mini quiz!
        </p>
      </header>

      {!podiumDone ? (
        <section className="flex min-h-[420px] flex-col items-stretch justify-end gap-4 rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-card">
          {top3.length === 0 ? (
            <div className="flex-1 py-20 text-center font-bold text-duo-gray-dark">
              No players answered this round.
            </div>
          ) : (
            <>
              <Podium rows={rows} onReveal={onPodiumReveal} />
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onPodiumReveal}
                  className="btn-3d rounded-2xl border-2 border-duo-gray-light bg-white px-5 py-2 text-sm font-black uppercase tracking-wide text-duo-ink shadow-3d-sm hover:bg-duo-cream"
                >
                  Skip to payout →
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr,1fr]">
          <section className="rounded-3xl border-2 border-duo-gray-light bg-duo-cream p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-duo-gray-dark">
              Final Leaderboard
            </h2>
            {rows.length === 0 ? (
              <div className="py-10 text-center font-bold text-duo-gray-dark">
                No scores recorded.
              </div>
            ) : (
              <Leaderboard rows={rows} payouts={payouts} />
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border-2 border-duo-gray-light bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
              Payout ceremony 💸
            </h2>
            <div className="flex flex-col gap-4">
              {top3.length === 0 && (
                <div className="py-6 text-center font-bold text-duo-gray-dark">
                  No winners to pay out.
                </div>
              )}
              {top3.map((row, idx) => {
                const rank = (idx + 1) as 1 | 2 | 3;
                const amount = prizeAmounts[idx] ?? "0";
                const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
                return (
                  <div
                    key={row.playerId}
                    className="flex flex-col gap-2 rounded-2xl border-2 border-duo-gray-light bg-duo-cream p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-duo-ink">
                      <span className="shrink-0 text-xl">{medal}</span>
                      <span className="min-w-0 flex-1 truncate" title={row.name}>
                        {row.name}
                      </span>
                      <span className="shrink-0 font-black tabular-nums text-duo-gray-dark">
                        {row.points} pts
                      </span>
                    </div>
                    <PayoutButton
                      roomId={roomId}
                      rank={rank}
                      playerId={row.playerId}
                      toAddress={row.address}
                      amount={amount}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
