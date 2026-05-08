"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

// Generic modal primitive. Two variants:
//   - "sheet"  — slides up from the bottom, hugs full width on mobile
//   - "center" — classic centered card
// Backdrop tap dismisses; ESC dismisses. Body slot consumes the rest.

export function MQModal({
  open,
  onClose,
  children,
  variant = "sheet",
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: "sheet" | "center";
  ariaLabel?: string;
}) {
  // ESC dismiss + body scroll-lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // Backdrop. Sits above tabbar (z 50) and everything else.
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(31, 42, 68, 0.45)",
            display: "flex",
            alignItems: variant === "sheet" ? "flex-end" : "center",
            justifyContent: "center",
            padding: variant === "sheet" ? 0 : 16,
          }}
        >
          <motion.div
            // The body. Spring-up on enter (sheet) or scale-up (center).
            onClick={(e) => e.stopPropagation()}
            initial={
              variant === "sheet"
                ? { y: "100%" }
                : { opacity: 0, scale: 0.92 }
            }
            animate={
              variant === "sheet"
                ? { y: 0 }
                : { opacity: 1, scale: 1 }
            }
            exit={
              variant === "sheet"
                ? { y: "100%" }
                : { opacity: 0, scale: 0.92 }
            }
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            style={{
              width: "100%",
              maxWidth: variant === "sheet" ? 420 : 360,
              background: "var(--card)",
              borderTopLeftRadius: variant === "sheet" ? 24 : 20,
              borderTopRightRadius: variant === "sheet" ? 24 : 20,
              borderBottomLeftRadius: variant === "sheet" ? 0 : 20,
              borderBottomRightRadius: variant === "sheet" ? 0 : 20,
              border: "2px solid var(--line)",
              borderBottom: variant === "sheet" ? "0" : "2px solid var(--line)",
              boxShadow: "0 -12px 32px rgba(31, 42, 68, 0.12)",
              paddingBottom:
                variant === "sheet"
                  ? "calc(env(safe-area-inset-bottom) + 12px)"
                  : 0,
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
