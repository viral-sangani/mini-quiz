"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { TopBar } from "@/components/TopBar";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-client";

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError("New password must contain at least one digit.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await adminApi.post<void>("/admin/auth/change-password", {
        currentPassword,
        newPassword,
      });
      // Force a fresh sign-in so the new credential is exercised.
      await signOut({ callbackUrl: "/signin?info=password-changed" });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Could not change password. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Settings" crumbs="Account" />
      <div className="adm-content">
        <div className="adm-page-h">
          <h1 className="font-display text-2xl font-black tracking-tight">
            Settings
          </h1>
        </div>

        <div className="adm-card" style={{ maxWidth: 520 }}>
          <div className="adm-card-h">
            <h3>Change password</h3>
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
              <label>Current password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="adm-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="adm-field">
              <label>New password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="adm-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--a-ink-faint)",
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                At least 8 characters, including a digit.
              </div>
            </div>
            <div className="adm-field">
              <label>Confirm new password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="adm-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                onClick={() => router.push("/overview")}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="adm-btn adm-btn--primary"
                disabled={busy}
              >
                {busy ? "Saving…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
