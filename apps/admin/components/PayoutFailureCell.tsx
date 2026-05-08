"use client";

import { useState } from "react";
import { parsePayoutFailureReason } from "@mini-quiz/shared";

// Renders a payout failure with a one-line summary inline. Click "Show
// details" to reveal the full raw viem error string. Keeps the table cell
// readable; the wall of text is still available for forensics.

export function PayoutFailureCell({ reason }: { reason: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!reason) return null;
  const { summary, raw } = parsePayoutFailureReason(reason);
  const hasMore = raw.length > summary.length + 6;

  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--a-wrong, #b91c1c)",
        marginTop: 2,
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      {summary}
      {hasMore && (
        <>
          {" · "}
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              color: "var(--a-ink-soft)",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        </>
      )}
      {expanded && (
        <pre
          style={{
            marginTop: 6,
            padding: 8,
            background: "var(--a-bg)",
            borderRadius: 6,
            color: "var(--a-ink-soft)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 220,
            overflow: "auto",
          }}
        >
          {raw}
        </pre>
      )}
    </div>
  );
}
