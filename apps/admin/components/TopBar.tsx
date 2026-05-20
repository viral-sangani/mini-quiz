"use client";

import { AdminIcon } from "./AdminIcon";

export function TopBar({
  title,
  crumbs,
  primaryAction,
}: {
  title: React.ReactNode;
  crumbs?: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  return (
    <div className="adm-topbar">
      <div style={{ display: "flex", flexDirection: "column", minWidth: 200 }}>
        {crumbs && <div className="adm-crumbs" style={{ color: "var(--a-ink-faint)" }}>{crumbs}</div>}
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16 }}>
          {title}
        </div>
      </div>
      <div className="adm-search">
        <AdminIcon name="search" size={14} color="var(--a-ink-faint)" />
        <span>Search games, players, payouts…</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="adm-btn" disabled aria-label="Notifications">
          <AdminIcon name="bell" size={14} color="var(--a-ink-soft)" />
        </button>
        {primaryAction}
      </div>
    </div>
  );
}
