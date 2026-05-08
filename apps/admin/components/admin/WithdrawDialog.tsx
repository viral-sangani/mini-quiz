"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/components/Toast";

type Token = "CELO" | "USDC" | "USDT";

// Single-purpose modal for treasury withdrawals. The TreasurySection
// passes the chosen token + the current available balance; we let the
// admin type a recipient + amount, hit POST /admin/treasury/withdraw,
// and toast on success/failure.
export function WithdrawDialog({
  open,
  token,
  availableAmount,
  onClose,
  onSuccess,
}: {
  open: boolean;
  token: Token | null;
  availableAmount: string;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
}) {
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Reset form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setToAddress("");
      setAmount("");
      setError(null);
    }
  }, [open]);

  if (!open || !token) return null;

  const onSubmit = async () => {
    setError(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress.trim())) {
      setError("Recipient must be a valid 0x address");
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    if (n > Number(availableAmount)) {
      setError(`Only ${availableAmount} ${token} available`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminApi.post<{ txHash: string }>(
        "/admin/treasury/withdraw",
        {
          token,
          amount,
          toAddress: toAddress.trim(),
        },
      );
      onSuccess(res.txHash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdraw failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(31, 42, 68, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="adm-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxWidth: "calc(100vw - 32px)" }}
      >
        <div className="adm-card-h">
          <h3>Withdraw {token}</h3>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <div className="adm-field">
            <label>Recipient address</label>
            <input
              className="adm-input"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="0x…"
              disabled={submitting}
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </div>
          <div className="adm-field">
            <label>Amount</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="adm-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                disabled={submitting}
                style={{ flex: 1 }}
                inputMode="decimal"
              />
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() => setAmount(availableAmount)}
                disabled={submitting}
              >
                Max
              </button>
            </div>
            <span style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
              Available: {availableAmount} {token}. Locked-in-quizzes funds
              are excluded.
            </span>
          </div>
          {error && (
            <div
              style={{
                color: "var(--a-wrong, #b91c1c)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--a-ink-soft)" }}>
            This sends {token} from the treasury wallet on Celo mainnet.
            Double-check the recipient — the transaction is irreversible.
          </div>
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--a-line)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="adm-btn"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => void onSubmit()}
            disabled={submitting || !toAddress || !amount}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
