"use client";

import { useEffect, useState } from "react";
import { BLOCKSCOUT_ADDRESS } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/components/Toast";
import { WithdrawDialog } from "./WithdrawDialog";

export type TreasurySummary = {
  address: string;
  balances: { CELO: string; USDC: string; USDT: string };
  locked: { CELO: string; USDC: string; USDT: string };
  available: { CELO: string; USDC: string; USDT: string };
  fetchedAt: number;
};

const TOKENS = ["CELO", "USDC", "USDT"] as const;
type TokenSymbol = (typeof TOKENS)[number];

// Format a decimal string for display: trim trailing zeros, cap at 4
// fractional digits for stables, 6 for CELO. Falls through unchanged if
// the input doesn't parse.
function fmt(value: string, symbol: TokenSymbol): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n === 0) return "0";
  const dp = symbol === "CELO" ? 6 : 4;
  const fixed = n.toFixed(dp);
  // Strip trailing zeros after the decimal point, then a lone trailing dot.
  return fixed.replace(/\.?0+$/, "");
}

export function TreasurySection() {
  const [summary, setSummary] = useState<TreasurySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawFor, setWithdrawFor] = useState<TokenSymbol | null>(null);
  const toast = useToast();

  const load = async () => {
    try {
      const data = await adminApi.get<TreasurySummary>("/admin/treasury");
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load treasury");
    }
  };

  // Initial load + 30s refresh while the page is open. Aligns with the
  // server-side cache TTL so we're not re-doing chain reads pointlessly.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const onWithdrawSuccess = (txHash: string, token: TokenSymbol) => {
    toast.success(`Sent ${token} · tx ${txHash.slice(0, 10)}…`);
    setWithdrawFor(null);
    void load();
  };

  return (
    <div className="adm-card" style={{ marginBottom: 20, padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "var(--a-ink-faint)",
              letterSpacing: 0.08,
              textTransform: "uppercase",
            }}
          >
            Treasury wallet
          </div>
          {summary && (
            <a
              href={BLOCKSCOUT_ADDRESS(summary.address)}
              target="_blank"
              rel="noreferrer"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                color: "var(--a-ink)",
                textDecoration: "none",
                fontWeight: 600,
              }}
              title="Open on Blockscout"
            >
              {summary.address}
            </a>
          )}
          {error && (
            <div style={{ color: "var(--a-wrong)", fontSize: 12 }}>{error}</div>
          )}
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--sm"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {TOKENS.map((sym) => {
          const av = summary ? fmt(summary.available[sym], sym) : "—";
          const lk = summary ? fmt(summary.locked[sym], sym) : "—";
          const tot = summary ? fmt(summary.balances[sym], sym) : "—";
          const accent =
            sym === "CELO"
              ? "var(--a-primary)"
              : sym === "USDC"
                ? "var(--a-sky, #2563eb)"
                : "var(--a-accent, #16a34a)";
          return (
            <div
              key={sym}
              style={{
                border: "1px solid var(--a-line)",
                borderRadius: 10,
                padding: 14,
                position: "relative",
                background: "var(--a-card, white)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: accent,
                  borderRadius: "10px 10px 0 0",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 900,
                    fontSize: 14,
                    color: accent,
                  }}
                >
                  {sym}
                </span>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm"
                  onClick={() => setWithdrawFor(sym)}
                  disabled={!summary || Number(summary.available[sym]) <= 0}
                  title={
                    summary && Number(summary.available[sym]) <= 0
                      ? "Nothing available to withdraw"
                      : undefined
                  }
                >
                  Withdraw
                </button>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  fontSize: 20,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--a-ink)",
                }}
              >
                {av}
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--a-ink-faint)",
                    fontWeight: 700,
                    marginLeft: 4,
                  }}
                >
                  available
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--a-ink-soft)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>
                  <strong style={{ color: "var(--a-ink)" }}>{lk}</strong> locked
                </span>
                <span>
                  <strong style={{ color: "var(--a-ink)" }}>{tot}</strong> total
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <WithdrawDialog
        open={withdrawFor !== null}
        token={withdrawFor}
        availableAmount={
          withdrawFor && summary ? summary.available[withdrawFor] : "0"
        }
        onClose={() => setWithdrawFor(null)}
        onSuccess={(tx) => withdrawFor && onWithdrawSuccess(tx, withdrawFor)}
      />
    </div>
  );
}
