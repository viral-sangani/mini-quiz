// Friendly summarizer for payout failure reasons.
//
// `Payout.failureReason` stores the raw stringified error from viem (or
// any other transport we attempt). The full string can be 1000+ chars,
// includes nested encodings, and is hostile to a UI that wants a
// glanceable status. This module pattern-matches the most common viem
// shapes and returns a one-line summary plus the original raw string
// (for a "Show details" affordance).
//
// Goals:
//   - Never throw. Worst case: return the original (truncated) text.
//   - No external deps. Pure regex + string matching so it works on
//     both client and server bundles.

export type PayoutFailureSummary = {
  /** Short, human-readable line. <= 80 chars in the common case. */
  summary: string;
  /** The full original error string, for forensics + a "details" reveal. */
  raw: string;
};

const PATTERNS: { test: RegExp; build: (m: RegExpMatchArray) => string }[] = [
  // viem reverts: "Execution reverted with reason: <message>." OR
  // "Execution reverted with reason: <message>.  Request Arguments: ..."
  {
    test: /reverted with reason:\s*([^.\n]+?)(?:\s*\.|\s*Request Arguments:)/i,
    build: (m) => `Reverted: ${m[1]?.trim() ?? "unknown reason"}`,
  },
  // viem revert with no reason
  {
    test: /reverted(?! with reason)/i,
    build: () => "Transaction reverted on-chain",
  },
  // gas allowance
  {
    test: /gas required exceeds allowance/i,
    build: () => "Gas required exceeds allowance",
  },
  // out of funds
  {
    test: /insufficient funds/i,
    build: () => "Treasury wallet has insufficient funds",
  },
  // nonce
  {
    test: /nonce too low/i,
    build: () => "Nonce too low — likely a replay or out-of-order send",
  },
  {
    test: /nonce too high/i,
    build: () => "Nonce too high — pending transaction may be stuck",
  },
  // RPC connectivity
  {
    test: /timeout/i,
    build: () => "Request timed out",
  },
  {
    test: /network|ECONNREFUSED|fetch failed|getaddrinfo/i,
    build: () => "Network error reaching the RPC",
  },
  // generic on-chain "reason: ..."
  {
    test: /\breason:\s*"?([^"\n]+?)"?(?:[.,\s]|$)/i,
    build: (m) => `Reason: ${m[1]?.trim() ?? "unknown"}`,
  },
];

export function parsePayoutFailureReason(
  raw: string | null | undefined,
): PayoutFailureSummary {
  const text = (raw ?? "").trim();
  if (!text) {
    return { summary: "Unknown failure", raw: "" };
  }
  for (const p of PATTERNS) {
    const m = text.match(p.test);
    if (m) {
      return { summary: p.build(m), raw: text };
    }
  }
  // Fall back to the first line, truncated. Avoids dumping the full
  // multi-paragraph viem error in the table cell.
  const firstLine = text.split("\n")[0]!.trim();
  const summary =
    firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
  return { summary, raw: text };
}
