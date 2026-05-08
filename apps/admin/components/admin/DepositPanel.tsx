"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/components/Toast";

type Token = "CELO" | "USDC" | "USDT";

type TreasurySummary = {
  address: string;
  available: { CELO: string; USDC: string; USDT: string };
  balances: { CELO: string; USDC: string; USDT: string };
  fetchedAt: number;
};

// Inline deposit panel rendered below the QuizForm prize section when the
// treasury is short on the chosen token. Shows the treasury address with a
// copy button, a QR code, and the missing amount. Polls /admin/treasury
// every 8 seconds; when available crosses the required threshold, fires
// onSatisfied so the parent can unlock its submit button.
//
// Polling stops automatically when satisfied OR after 30 minutes (so
// abandoned tabs don't hammer the api forever).
export function DepositPanel({
  token,
  required,
  treasuryAddress,
  onSatisfied,
}: {
  token: Token;
  required: number;
  treasuryAddress: string;
  onSatisfied: () => void;
}) {
  const [available, setAvailable] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const [copied, setCopied] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const toast = useToast();

  // Generate a QR for the address (no chain prefix; admins paste into any
  // wallet). qrcode is already a dep of the admin app.
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(treasuryAddress, {
      width: 192,
      margin: 1,
      color: { dark: "#1F2A44", light: "#FFFFFF" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  // Poll /admin/treasury until balance crosses required. We also fire
  // once on mount so the user sees an initial value quickly.
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await adminApi.get<TreasurySummary>("/admin/treasury");
        if (cancelled) return;
        const av = Number(data.available[token]);
        setAvailable(Number.isFinite(av) ? av : 0);
        if (Number.isFinite(av) && av >= required) {
          onSatisfied();
          setPolling(false);
        }
      } catch {
        // best-effort; keep polling
      }
    };
    void tick();
    const id = setInterval(() => {
      // 30-minute cap to avoid runaway polling.
      if (Date.now() - startedAtRef.current > 30 * 60_000) {
        setPolling(false);
        clearInterval(id);
        return;
      }
      void tick();
    }, 8_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling, token, required, onSatisfied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(treasuryAddress);
      setCopied(true);
      toast.info("Treasury address copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const need = available != null ? Math.max(0, required - available) : required;

  return (
    <div
      className="adm-card"
      style={{
        marginTop: 16,
        borderColor: "var(--a-accent, #f59e0b)",
        background: "var(--a-accent-tint, #fffbeb)",
      }}
    >
      <div
        className="adm-card-h"
        style={{ borderBottomColor: "var(--a-accent, #f59e0b)" }}
      >
        <h3>Deposit needed</h3>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "var(--a-accent-shade, #b45309)",
            letterSpacing: 0.06,
            textTransform: "uppercase",
          }}
        >
          {polling ? "Watching for deposit…" : "Stopped"}
        </span>
      </div>
      <div style={{ padding: 18, display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "start" }}>
        <div
          style={{
            background: "white",
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--a-line)",
            width: 208,
            height: 208,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Treasury address QR" width={192} height={192} />
          ) : (
            <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
              Loading QR…
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "var(--a-ink-faint)",
                letterSpacing: 0.06,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Send to (Celo mainnet)
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "white",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--a-line)",
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                color: "var(--a-ink)",
                wordBreak: "break-all",
              }}
            >
              <span style={{ flex: 1 }}>{treasuryAddress}</span>
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() => void copy()}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontFamily: "var(--font-display)",
            }}
          >
            <span style={{ fontWeight: 900, fontSize: 28, color: "var(--a-ink)" }}>
              {need.toFixed(token === "CELO" ? 4 : 2)}
            </span>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--a-ink-soft)" }}>
              {token} short
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--a-ink-soft)", lineHeight: 1.4 }}>
            Send any wallet&apos;s {token} to this address. The treasury
            balance refreshes every 8 seconds; this form unlocks the moment
            it covers the prize pool.
            {token !== "CELO" && (
              <>
                {" "}
                The treasury also needs a small CELO balance to pay gas.
              </>
            )}
          </div>
          {available != null && (
            <div
              style={{
                fontSize: 11,
                color: "var(--a-ink-faint)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Current available: {available} {token} · Required: {required}{" "}
              {token}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
