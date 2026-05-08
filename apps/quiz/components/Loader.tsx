"use client";

import { Mango, type MangoPose } from "./Mango";

// Themed full-page loader. Used everywhere a tab is fetching its first
// payload. Keeps the visual language consistent with the rest of the app
// (mascot, bobbing animation, friendly copy) instead of plain "Loading…".
export function Loader({
  label = "Just a sec…",
  sub,
  pose = "think",
  size = 110,
}: {
  label?: string;
  sub?: string;
  pose?: MangoPose;
  size?: number;
}) {
  return (
    <div
      className="mq-loading"
      style={{
        minHeight: "60dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
      }}
    >
      <span className="mq-bob" style={{ display: "inline-block" }}>
        <Mango pose={pose} size={size} />
      </span>
      <div
        className="mq-h3"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 16,
          color: "var(--ink)",
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          className="mq-body"
          style={{ fontSize: 13, color: "var(--ink-soft)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
