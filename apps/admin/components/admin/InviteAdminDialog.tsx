"use client";

import { useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-client";

export function InviteAdminDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/\d/.test(password)) {
      setError("Password must be at least 8 characters and contain a digit.");
      return;
    }
    setBusy(true);
    try {
      await adminApi.post<{ userId: string }>("/admin/auth/admins", {
        email,
        password,
      });
      onCreated();
      setEmail("");
      setPassword("");
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create admin");
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
          <h3>Invite admin</h3>
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
          <div className="adm-field">
            <label>Email</label>
            <input
              type="email"
              required
              className="adm-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="newadmin@example.com"
            />
          </div>
          <div className="adm-field">
            <label>Initial password</label>
            <input
              type="text"
              required
              className="adm-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Share securely with the new admin"
            />
            <div
              style={{
                fontSize: 11,
                color: "var(--a-ink-faint)",
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              The new admin should change this on first sign-in.
            </div>
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
              {busy ? "Creating…" : "Create admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
