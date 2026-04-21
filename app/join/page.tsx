"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BigButton } from "@/components/BigButton";
import { Mascot } from "@/components/Mascot";

const CODE_RE = /^[A-Z0-9]{5}$/;

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCode = searchParams.get("code") ?? "";

  const [code, setCode] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (prefillCode) {
      const normalized = prefillCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      setCode(normalized);
    }
  }, [prefillCode]);

  const trimmedName = name.trim();
  const codeValid = CODE_RE.test(code);
  const canSubmit = codeValid && trimmedName.length > 0;

  const helperText = useMemo(() => {
    if (code.length === 0) return "5-character code from the host";
    if (!codeValid) return "Codes are 5 letters/numbers, e.g. ABCDE";
    return "Looking good! 🎯";
  }, [code, codeValid]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const url = `/play/${encodeURIComponent(code)}?name=${encodeURIComponent(trimmedName)}`;
    router.push(url);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-duo-cream via-white to-duo-cream px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-duo-yellow/30 blur-3xl" />
        <div className="absolute -right-20 bottom-16 h-64 w-64 rounded-full bg-duo-green/30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-4 flex justify-start">
          <Link
            href="/"
            className="text-sm font-black uppercase tracking-wide text-duo-gray-dark hover:text-duo-ink"
          >
            ← Back
          </Link>
        </div>

        <div className="rounded-3xl border-2 border-duo-gray-light bg-white p-6 shadow-3d-lg">
          <div className="flex flex-col items-center gap-2 text-center">
            <Mascot mood="happy" size={88} />
            <h1 className="font-display text-3xl font-black text-duo-ink">
              Join the quiz 🎉
            </h1>
            <p className="text-sm font-semibold text-duo-gray-dark">
              Enter the room code from the host screen.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="room-code"
                className="text-xs font-black uppercase tracking-wide text-duo-gray-dark"
              >
                Room code
              </label>
              <input
                id="room-code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={5}
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 5)
                  )
                }
                placeholder="ABCDE"
                className="w-full rounded-2xl border-2 border-duo-gray-light bg-duo-cream px-4 py-4 text-center font-display text-3xl font-black uppercase tracking-[0.4em] text-duo-ink outline-none focus:border-duo-blue"
              />
              <div
                className={`text-xs font-semibold ${
                  code.length === 0
                    ? "text-duo-gray-dark"
                    : codeValid
                    ? "text-duo-green"
                    : "text-duo-red"
                }`}
              >
                {helperText}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="display-name"
                className="text-xs font-black uppercase tracking-wide text-duo-gray-dark"
              >
                Your display name
              </label>
              <input
                id="display-name"
                type="text"
                autoComplete="nickname"
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                placeholder="e.g. Nico 🌶️"
                className="w-full rounded-2xl border-2 border-duo-gray-light bg-duo-cream px-4 py-3 text-base font-bold text-duo-ink outline-none focus:border-duo-blue"
              />
              <div className="text-right text-xs font-semibold text-duo-gray-dark">
                {trimmedName.length}/30
              </div>
            </div>

            <BigButton
              type="submit"
              variant="green"
              size="xl"
              disabled={!canSubmit}
              className="w-full"
            >
              Next →
            </BigButton>
          </form>
        </div>
      </div>
    </main>
  );
}
