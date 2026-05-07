"use client";

import { signOut } from "next-auth/react";
import { AdminIcon } from "./AdminIcon";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/signin" })}
      className="adm-btn adm-btn--sm adm-btn--ghost"
      style={{ padding: 6, height: 28 }}
      aria-label="Sign out"
      title="Sign out"
    >
      <AdminIcon name="logout" size={14} color="var(--a-ink-faint)" />
    </button>
  );
}
