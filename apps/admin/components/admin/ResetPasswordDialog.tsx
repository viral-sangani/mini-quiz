"use client";

import { useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-client";

export function ResetPasswordDialog({
  open,
  target,
  onClose,
  onReset,
}: {
  open: boolean;
  target: { userId: string; email: string } | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || !target) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      setError("Password must be at least 8 characters and contain a digit.");
      return;
    }
    setBusy(true);
    try {
      await adminApi.post<void>(
        `/admin/auth/admins/${target.userId}/reset-password`,
        { newPassword },
      );
      onReset();
      setNewPassword("");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="adm-card"
        style={{ width: 420, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-card-h">
          <h3>Reset password</h3>
        </div>
        <form
          onSubmit={onSubmit}
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--a-ink-soft)", margin: 0 }}>
            Resetting password for <b>{target.email}</b>. Share the new
            password securely; they should change it on next sign-in.
          </p>
          <div className="adm-field">
            <label>New password</label>
            <input
              type="text"
              required
              className="adm-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 chars, contains a digit"
            />
          </div>

          {error && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--a-wrong-tint)",
                color: "var(--a-wrong)",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="adm-btn"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adm-btn adm-btn--primary"
              disabled={busy}
            >
              {busy ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
