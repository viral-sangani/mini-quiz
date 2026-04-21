import { Mascot } from "@/components/Mascot";
import { LandingActions } from "@/components/LandingActions";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-duo-cream via-white to-duo-cream px-6 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-duo-yellow/30 blur-3xl" />
        <div className="absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-duo-green/30 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-celo-yellow/30 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-8 text-center">
        <Mascot mood="happy" size={128} />

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-5xl font-black leading-tight text-duo-ink sm:text-6xl">
            <span className="inline-block">🎉 MiniPay</span>{" "}
            <span className="inline-block text-duo-green">Mini Quiz</span>
          </h1>
          <p className="text-lg font-bold text-duo-gray-dark sm:text-xl">
            Play. Answer. Win USDT live.
          </p>
        </div>

        <LandingActions />

        <footer className="pt-10 text-xs font-semibold text-duo-gray-dark">
          Built for Celo × MiniPay 🇵🇭
        </footer>
      </div>
    </main>
  );
}
