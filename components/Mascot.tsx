"use client";

import { motion } from "framer-motion";

type Mood = "idle" | "happy" | "sad" | "winner" | "thinking";

const FACE: Record<Mood, string> = {
  idle: "🦎",
  happy: "🥳",
  sad: "🥲",
  winner: "🏆",
  thinking: "🤔",
};

export function Mascot({ mood = "idle", size = 96 }: { mood?: Mood; size?: number }) {
  return (
    <motion.div
      className="inline-flex items-center justify-center"
      style={{ fontSize: size, lineHeight: 1 }}
      animate={
        mood === "idle"
          ? { y: [0, -6, 0], rotate: [0, -2, 2, 0] }
          : mood === "happy" || mood === "winner"
          ? { scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }
          : mood === "sad"
          ? { rotate: [0, -4, 4, 0] }
          : { scale: [1, 1.05, 1] }
      }
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      {FACE[mood]}
    </motion.div>
  );
}
