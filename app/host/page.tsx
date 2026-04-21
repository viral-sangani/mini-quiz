"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BigButton } from "@/components/BigButton";
import { Mascot } from "@/components/Mascot";
import { connectAddress, hasInjectedWallet } from "@/lib/minipay";
import { HOST_ADDRESS, isHostAddress } from "@/lib/host";
import { SEED_QUESTIONS } from "@/lib/seed-questions";

type QuestionTime = 10_000 | 15_000 | 20_000 | 30_000;

const QUESTION_TIME_OPTIONS: { label: string; value: QuestionTime }[] = [
  { label: "10s", value: 10_000 },
  { label: "15s", value: 15_000 },
  { label: "20s", value: 20_000 },
  { label: "30s", value: 30_000 },
];

const BUFFER_MS = 5_000;
const QUESTION_COUNT = SEED_QUESTIONS.length;

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s}s`;
}

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-3d rounded-2xl border-2 px-5 py-3 text-base font-extrabold uppercase tracking-wide transition-colors ${
        active
          ? "border-duo-green-dark bg-duo-green text-white shadow-3d-green"
          : "border-duo-gray-light bg-white text-duo-ink shadow-3d-sm hover:bg-duo-cream"
      }`}
    >
      {children}
    </button>
  );
}

export default function HostCreatePage() {
  const router = useRouter();
  const [questionTimeMs, setQuestionTimeMs] = useState<QuestionTime>(15_000);
  const durationMs = QUESTION_COUNT * questionTimeMs + BUFFER_MS;
  const [prizes, setPrizes] = useState<string[]>([
    "50",
    "25",
    "15",
    "5",
    "5",
    "5",
    "5",
    "5",
    "5",
    "5",
  ]);
  const setPrizeAt = (i: number, v: string) =>
    setPrizes((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasInjectedWallet()) {
        if (!cancelled) setAuthChecked(true);
        return;
      }
      const addr = await connectAddress();
      if (cancelled) return;
      setAddress(addr);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthorized = isHostAddress(address);

  async function handleCreate() {
    if (!isAuthorized || !address) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-address": address,
        },
        body: JSON.stringify({
          durationMs,
          questionTimeMs,
          prizeAmounts: prizes,
          hostAddress: address,
        }),
      });
      if (!res.ok) {
        throw new Error(`Create failed (${res.status})`);
      }
      const data = (await res.json()) as { roomId: string };
      router.push(`/host/${data.roomId}`);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Could not create room");
    }
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream px-6">
        <p className="font-display text-lg font-bold text-duo-gray-dark">Checking wallet…</p>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-duo-cream px-6 py-10">
        <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border-2 border-duo-gray-light bg-white p-8 text-center shadow-3d-lg">
          <Mascot mood="sad" size={96} />
          <h1 className="font-display text-3xl font-black text-duo-ink">Hosts only 🔒</h1>
          <p className="text-sm font-semibold text-duo-gray-dark">
            Only the official host wallet can create rooms. Open this in MiniPay with the host
            account.
          </p>
          <div className="w-full rounded-xl bg-duo-cream px-3 py-2 font-mono text-xs text-duo-gray-dark">
            {address ?? "No wallet connected"}
          </div>
          <p className="text-xs font-semibold text-duo-gray-dark">
            Expected: <span className="font-mono">{HOST_ADDRESS.slice(0, 8)}…{HOST_ADDRESS.slice(-6)}</span>
          </p>
          <Link href="/join" className="w-full">
            <BigButton variant="yellow" size="lg" className="w-full">
              Join a Room Instead
            </BigButton>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-duo-cream px-6 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-center gap-4">
          <Mascot mood="thinking" size={72} />
          <div>
            <h1 className="font-display text-4xl font-black text-duo-ink sm:text-5xl">
              Create a Room
            </h1>
            <p className="font-semibold text-duo-gray-dark">
              Set the rules. Start the show.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-card">
          <h2 className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
            Per-question time
          </h2>
          <div className="flex flex-wrap gap-3">
            {QUESTION_TIME_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                active={questionTimeMs === opt.value}
                onClick={() => setQuestionTimeMs(opt.value)}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
          <p className="text-sm font-semibold text-duo-gray-dark">
            Total quiz time:{" "}
            <span className="font-black text-duo-ink">
              {formatDuration(durationMs)}
            </span>{" "}
            ({QUESTION_COUNT} questions × {questionTimeMs / 1000}s +{" "}
            {BUFFER_MS / 1000}s buffer)
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-card">
          <h2 className="text-sm font-black uppercase tracking-widest text-duo-gray-dark">
            Prize amounts (USDT) — top 10
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {prizes.map((v, i) => {
              const rank = i + 1;
              const label =
                rank === 1 ? "🥇 1st" : rank === 2 ? "🥈 2nd" : rank === 3 ? "🥉 3rd" : `#${rank}`;
              return (
                <PrizeInput
                  key={i}
                  label={label}
                  value={v}
                  onChange={(nv) => setPrizeAt(i, nv)}
                />
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border-2 border-duo-red bg-white px-4 py-3 text-center font-bold text-duo-red">
            {error}
          </div>
        )}

        <BigButton
          variant="green"
          size="xl"
          onClick={handleCreate}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Creating…" : "Create Room 🚀"}
        </BigButton>
      </div>
    </main>
  );
}

function PrizeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-center text-base font-extrabold text-duo-ink">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-full rounded-2xl border-2 border-duo-gray-light bg-white px-3 text-center text-xl font-black tabular-nums text-duo-ink shadow-3d-sm focus:border-duo-green focus:outline-none"
      />
    </label>
  );
}
