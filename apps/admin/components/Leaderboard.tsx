"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LeaderboardRow, PayoutTokenSymbol, PublicPayout } from "@mini-quiz/shared";
import { BLOCKSCOUT_TX } from "@mini-quiz/shared";

const AVATAR_EMOJIS = [
  "🦎",
  "🐙",
  "🦊",
  "🐼",
  "🐵",
  "🦉",
  "🦄",
  "🐸",
  "🐯",
  "🐨",
  "🦁",
  "🐶",
  "🐱",
  "🐰",
  "🦀",
  "🐳",
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
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function rankTint(rank: number): string {
  if (rank === 1) return "text-[#D4AF37]";
  if (rank === 2) return "text-[#9CA3AF]";
  if (rank === 3) return "text-[#B87333]";
  return "text-duo-gray-dark";
}

export function Leaderboard({
  rows,
  highlightUserId,
  payouts = [],
  payoutToken = "USDT",
}: {
  rows: LeaderboardRow[];
  highlightUserId?: string;
  payouts?: PublicPayout[];
  payoutToken?: PayoutTokenSymbol;
}) {
  const top = rows.slice(0, 10);
  const rest = Math.max(0, rows.length - top.length);

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {top.map((row, idx) => {
          const rank = idx + 1;
          const isMe = highlightUserId === row.userId;
          const hash = hashString(row.userId);
          const emoji = AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
          const gradient = GRADIENTS[hash % GRADIENTS.length];
          const payout = payouts.find(
            (p) => p.rank === rank && p.userId === row.userId,
          );

          return (
            <motion.div
              key={row.userId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: isMe ? 1.02 : 1,
              }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`relative flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 shadow-3d-sm ${
                isMe ? "border-duo-yellow" : "border-duo-gray-light"
              }`}
            >
              <div
                className={`w-8 shrink-0 text-center font-black text-2xl ${rankTint(
                  rank,
                )}`}
              >
                {rank}
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-xl`}
                aria-hidden
              >
                {emoji}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate font-bold text-duo-ink">
                  {row.displayName}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-duo-gray-dark">
                  <span className="inline-block h-2 w-2 rounded-full bg-duo-green" />
                  <span className="font-semibold">
                    {row.correctCount} correct
                  </span>
                </div>
              </div>
              <div className="text-right font-black text-2xl text-duo-ink tabular-nums">
                {row.points}
              </div>

              {payout?.txHash && (
                <motion.a
                  layout
                  href={BLOCKSCOUT_TX(payout.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-duo-green px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-3d-sm"
                >
                  <span>💸</span>
                  <span>
                    {payout.status === "CONFIRMED"
                      ? `Received ${payout.amount} ${payoutToken} ✓`
                      : `${payout.amount} ${payoutToken} on the way…`}
                  </span>
                </motion.a>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {rest > 0 && (
        <div className="pt-1 text-center text-sm font-semibold text-duo-gray-dark">
          +{rest} more
        </div>
      )}
    </div>
  );
}
