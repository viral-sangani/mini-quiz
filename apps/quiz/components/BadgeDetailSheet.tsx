"use client";

import type { BadgeDef } from "@mini-quiz/shared";
import { avatarColorVar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { MQModal } from "./MQModal";

// Bottom-sheet detail for a profile badge. Shows the full art, label,
// description, and earned/locked state. For earned badges we show the
// awarded date.

export function BadgeDetailSheet({
  open,
  badge,
  earnedAt,
  onClose,
}: {
  open: boolean;
  badge: BadgeDef | null;
  earnedAt?: string | null;
  onClose: () => void;
}) {
  if (!badge) {
    return (
      <MQModal open={open} onClose={onClose} ariaLabel="Badge details">
        <div style={{ padding: 24 }} />
      </MQModal>
    );
  }
  const earned = !!earnedAt;
  const tint = avatarColorVar(badge.color);
  return (
    <MQModal open={open} onClose={onClose} ariaLabel={`${badge.label} details`}>
      <div
        style={{
          padding: "24px 24px 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        {/* Drag handle hint. Cosmetic. */}
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 5,
            borderRadius: 99,
            background: "var(--line)",
            marginTop: -8,
            marginBottom: 4,
          }}
        />
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: earned ? tint : "var(--bg)",
            border: "3px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: earned
              ? "inset 0 -6px 0 0 rgba(0,0,0,0.16), 0 4px 0 0 rgba(0,0,0,0.08)"
              : "inset 0 -3px 0 0 rgba(0,0,0,0.08)",
          }}
        >
          <Icon
            name={(earned ? badge.icon : "lock") as IconName}
            size={44}
            color={earned ? "white" : "var(--ink-faint)"}
          />
        </div>
        <h2
          className="mq-h2"
          style={{ fontSize: 22, lineHeight: 1.2, margin: 0 }}
        >
          {badge.label}
        </h2>
        {earned ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--primary)",
              color: "white",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: 0.06,
              textTransform: "uppercase",
            }}
          >
            <Icon name="check" size={12} color="white" strokeWidth={4} /> Earned
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--bg)",
              color: "var(--ink-soft)",
              border: "2px solid var(--line)",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: 0.06,
              textTransform: "uppercase",
            }}
          >
            Locked
          </span>
        )}
        <p
          className="mq-body"
          style={{
            fontSize: 14,
            color: "var(--ink)",
            lineHeight: 1.45,
            maxWidth: 320,
            margin: 0,
          }}
        >
          {badge.description}
        </p>
        {earned && earnedAt && (
          <p
            className="mq-body"
            style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -4 }}
          >
            Earned {formatEarnedDate(earnedAt)}
          </p>
        )}
        {!earned && (
          <p
            className="mq-body"
            style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -4 }}
          >
            Keep playing to unlock.
          </p>
        )}
      </div>
      <div style={{ padding: "12px 16px 16px" }}>
        <button
          type="button"
          onClick={onClose}
          className="mq-btn mq-btn--ghost mq-btn--block"
        >
          Close
        </button>
      </div>
    </MQModal>
  );
}

function formatEarnedDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
