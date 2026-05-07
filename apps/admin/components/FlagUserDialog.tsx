"use client";

import { useEffect, useRef, useState } from "react";

export function FlagUserDialog({
  open,
  userName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  userName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      // Focus textarea when modal opens.
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 42, 68, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        className="adm-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "calc(100vw - 32px)" }}
      >
        <div className="adm-card-h">
          <h3>Flag {userName}</h3>
        </div>
        <div style={{ padding: 18 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--a-ink-soft)",
              marginBottom: 12,
            }}
          >
            Flagging is visible to other admins. The reason is stored alongside the account for moderation history.
          </p>
          <div className="adm-field">
            <label>Reason</label>
            <textarea
              ref={ref}
              className="adm-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this account being flagged?"
              rows={3}
            />
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
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            onClick={() => void handleConfirm()}
            disabled={submitting || !reason.trim()}
          >
            {submitting ? "Flagging…" : "Flag account"}
          </button>
        </div>
      </div>
    </div>
  );
}
