"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LeaderboardRow } from "@/lib/events";
import { fireConfetti } from "./ConfettiBurst";

type Slot = {
  row: LeaderboardRow;
  rank: 1 | 2 | 3;
  heightClass: string;
  color: string;
  delayMs: number;
  medal: string;
  order: number; // visual left-to-right order
};

export function Podium({
  rows,
  onReveal,
}: {
  rows: LeaderboardRow[];
  onReveal?: () => void;
}) {
  const [revealed, setRevealed] = useState<number>(0);
  const firedConfettiRef = useRef(false);
  const firedDoneRef = useRef(false);

  const slots: Slot[] = [];
  if (rows[1]) {
    slots.push({
      row: rows[1],
      rank: 2,
      heightClass: "h-40",
      color: "bg-duo-blue",
      delayMs: 4500,
      medal: "🥈",
      order: 0,
    });
  }
  if (rows[0]) {
    slots.push({
      row: rows[0],
      rank: 1,
      heightClass: "h-56",
      color: "bg-duo-yellow",
      delayMs: 6000,
      medal: "🏆",
      order: 1,
    });
  }
  if (rows[2]) {
    slots.push({
      row: rows[2],
      rank: 3,
      heightClass: "h-32",
      color: "bg-duo-orange",
      delayMs: 3000,
      medal: "🥉",
      order: 2,
    });
  }

  // ordered by reveal time (rank 3 → 2 → 1)
  const sequence = [...slots].sort((a, b) => a.delayMs - b.delayMs);

  useEffect(() => {
    const timers = sequence.map((s, i) =>
      setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), s.delayMs)
    );
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isShown = (slot: Slot) => {
    const idx = sequence.findIndex((s) => s.rank === slot.rank);
    return idx >= 0 && idx < revealed;
  };

  const firstPlaceShown = slots.some((s) => s.rank === 1 && isShown(s));

  useEffect(() => {
    if (firstPlaceShown && !firedConfettiRef.current) {
      firedConfettiRef.current = true;
      fireConfetti();
    }
    if (revealed >= sequence.length && !firedDoneRef.current && sequence.length > 0) {
      firedDoneRef.current = true;
      onReveal?.();
    }
  }, [firstPlaceShown, revealed, sequence.length, onReveal]);

  // render in left-to-right visual order
  const visual = [...slots].sort((a, b) => a.order - b.order);

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      <AnimatePresence>
        {visual.map((slot) => (
          <div key={slot.rank} className="flex w-28 flex-col items-center sm:w-36">
            {isShown(slot) && (
              <motion.div
                initial={{ opacity: 0, y: -40, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="mb-2 flex flex-col items-center gap-1"
              >
                <div className="text-4xl sm:text-5xl" aria-hidden>
                  {slot.medal}
                </div>
                <div
                  className="w-full truncate px-1 text-center font-black text-duo-ink"
                  title={slot.row.name}
                >
                  {slot.row.name}
                </div>
                <div className="text-sm font-bold text-duo-gray-dark tabular-nums">
                  {slot.row.points} pts
                </div>
              </motion.div>
            )}
            <motion.div
              layout
              initial={{ height: 0 }}
              animate={{ height: isShown(slot) ? "auto" : 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className={`w-full overflow-hidden rounded-t-2xl ${slot.color} shadow-3d`}
            >
              <div
                className={`${slot.heightClass} flex items-start justify-center pt-3 font-black text-white text-3xl sm:text-4xl`}
              >
                {slot.rank}
              </div>
            </motion.div>
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
