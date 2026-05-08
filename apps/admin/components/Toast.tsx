"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Tiny toast system. Stack of 3 max; slide in from bottom-right; auto-dismiss
// after 4s (longer for errors so admins can read the message). ESC dismisses
// the most recent. No deps beyond framer-motion (already installed).
//
// Usage:
//   const { toast } = useToast();
//   toast.success("Quiz saved");
//   toast.error("Save failed: reason here");
//
// Mounted once at the (protected) layout level.

type ToastKind = "success" | "error" | "info";
type ToastEntry = {
  id: string;
  kind: ToastKind;
  message: string;
  expiresAt: number;
};

type Ctx = {
  push: (kind: ToastKind, message: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);
const STACK_MAX = 3;
const DURATIONS: Record<ToastKind, number> = {
  success: 3_500,
  info: 4_000,
  error: 6_000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  // Holds the active dismiss timeouts so we can clear them on unmount.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reduced = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const duration = DURATIONS[kind];
      const entry: ToastEntry = {
        id,
        kind,
        message,
        expiresAt: Date.now() + duration,
      };
      setItems((prev) => {
        // Cap the stack — drop the oldest if at the limit.
        const next = [...prev, entry];
        while (next.length > STACK_MAX) {
          const dropped = next.shift();
          if (dropped) {
            const t = timersRef.current.get(dropped.id);
            if (t) clearTimeout(t);
            timersRef.current.delete(dropped.id);
          }
        }
        return next;
      });
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  // Top-level ESC closes the most recent toast.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setItems((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1]!;
        const t = timersRef.current.get(last.id);
        if (t) clearTimeout(t);
        timersRef.current.delete(last.id);
        return prev.slice(0, -1);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cleanup all timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo<Ctx>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={
                reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.95 }
              }
              animate={
                reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }
              }
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{
                pointerEvents: "auto",
                minWidth: 260,
                maxWidth: 380,
                background: "var(--a-card, white)",
                border: "1px solid var(--a-line)",
                borderLeft: `4px solid ${accentFor(t.kind)}`,
                borderRadius: 10,
                boxShadow: "0 10px 32px rgba(31, 42, 68, 0.12)",
                padding: "10px 12px 10px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--a-ink)",
              }}
            >
              <span aria-hidden="true" style={{ marginTop: 2 }}>
                {t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}
              </span>
              <span style={{ flex: 1, lineHeight: 1.4, wordBreak: "break-word" }}>
                {t.message}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--a-ink-faint)",
                  cursor: "pointer",
                  padding: "0 0 0 6px",
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function accentFor(kind: ToastKind): string {
  if (kind === "success") return "var(--a-primary, #10b981)";
  if (kind === "error") return "var(--a-wrong, #ef4444)";
  return "var(--a-sky, #38B6FF)";
}

export function useToast(): {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
} {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail-safe: don't crash if a component is rendered outside the provider
    // (e.g. during a unit-test or storybook). Toasts just no-op.
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return {
    success: (msg) => ctx.push("success", msg),
    error: (msg) => ctx.push("error", msg),
    info: (msg) => ctx.push("info", msg),
  };
}
