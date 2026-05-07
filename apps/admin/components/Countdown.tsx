"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-6xl",
  xl: "text-[96px] leading-none",
};

function format(msLeft: number): string {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return String(secs);
}

export function Countdown({
  to,
  onDone,
  size = "lg",
}: {
  to: number;
  onDone?: () => void;
  size?: Size;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [to]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const msLeft = to - now;
  const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
  const urgent = msLeft > 0 && msLeft < 10_000;

  useEffect(() => {
    if (msLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      onDone?.();
    }
  }, [msLeft, onDone]);

  return (
    <motion.div
      className={`font-display font-black tabular-nums ${SIZE_CLASSES[size]} ${
        urgent ? "text-duo-red" : "text-duo-ink"
      }`}
      animate={
        urgent
          ? { scale: [1, 1.08, 1], rotate: [-2, 2, -2] }
          : { scale: 1, rotate: 0 }
      }
      transition={
        urgent
          ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      aria-live="polite"
    >
      {format(Math.max(0, msLeft))}
      <span className="sr-only">{secsLeft} seconds remaining</span>
    </motion.div>
  );
}
