"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminUser } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { CustomPill } from "@/components/StatusPill";
import { FlagUserDialog } from "@/components/FlagUserDialog";
import { formatLocal } from "@/lib/time";

type Filter = "all" | "flagged" | "admins";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admins", label: "Admins" },
  { id: "flagged", label: "Flagged" },
];

export default function PlayersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagFor, setFlagFor] = useState<AdminUser | null>(null);

  const load = async (opts?: { filter?: Filter; search?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const eff = opts ?? { filter, search };
      if (eff.search) params.set("q", eff.search);
      if (eff.filter === "flagged") params.set("flagged", "true");
      const data = await adminApi.get<{ users: AdminUser[] }>(
        `/admin/users${params.toString() ? `?${params}` : ""}`,
      );
      setUsers(data.users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ filter, search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const visibleUsers = useMemo(() => {
    if (filter === "admins") return users.filter((u) => u.role === "ADMIN");
    return users;
  }, [users, filter]);

  const totalPlayers = users.length;
  const flaggedCount = users.filter((u) => u.flagged).length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  const promote = async (id: string, role: "USER" | "ADMIN") => {
    try {
      await adminApi.patch(`/admin/users/${id}/role`, { role });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role update failed");
    }
  };

  const flag = async (id: string, reason: string) => {
    try {
      await adminApi.post(`/admin/users/${id}/flag`, { reason });
      setFlagFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flag failed");
    }
  };

  const unflag = async (id: string) => {
    try {
      await adminApi.post(`/admin/users/${id}/unflag`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unflag failed");
    }
  };

  return (
    <>
      <TopBar title="Players" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>Players</h1>
            <div className="adm-crumbs">
              {totalPlayers} loaded · {adminCount} admins · {flaggedCount} flagged
            </div>
          </div>
        </div>

        <KpiGrid>
          <KpiCard label="Total" value={totalPlayers.toLocaleString()} />
          <KpiCard label="Admins" value={adminCount} />
          <KpiCard
            label="Flagged"
            value={flaggedCount}
            tone={flaggedCount > 0 ? "down" : "up"}
            delta={flaggedCount > 0 ? "Review needed" : "All clear"}
          />
          <KpiCard
            label="With wallet"
            value={users.filter((u) => u.walletAddress).length}
          />
        </KpiGrid>

        <div className="adm-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`adm-chip${filter === f.id ? " active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load({ filter, search });
            }}
            className="adm-search"
            style={{ maxWidth: 280 }}
          >
            <AdminIcon name="search" size={13} color="var(--a-ink-faint)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, username, wallet…"
              style={{
                background: "transparent",
                border: 0,
                outline: 0,
                width: "100%",
                color: "var(--a-ink)",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </form>
        </div>

        {error && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--a-wrong-tint)",
              color: "var(--a-wrong)",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div className="adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Username</th>
                <th>Wallet</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                    Loading…
                  </td>
                </tr>
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                    No players match.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AdminAvatar
                          emoji={u.avatarEmoji}
                          color={u.avatarColor}
                          initials={initialsOf(u.displayName ?? u.email ?? u.username ?? "??")}
                        />
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            {u.displayName ?? u.email ?? "Player"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                            Joined {formatLocal(u.createdAt, { month: "short", year: "numeric" })}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--a-ink-soft)" }}>
                      {u.username ? `@${u.username}` : "—"}
                    </td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--a-ink-soft)" }}>
                      {u.walletAddress
                        ? `${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}`
                        : "—"}
                    </td>
                    <td>
                      {u.role === "ADMIN" ? (
                        <CustomPill variant="approved">ADMIN</CustomPill>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--a-ink-soft)", fontWeight: 600 }}>
                          User
                        </span>
                      )}
                    </td>
                    <td>
                      {u.flagged ? (
                        <span
                          title={u.flagReason ?? ""}
                          className="adm-badge review"
                        >
                          FLAGGED
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--a-ink-faint)", fontWeight: 600 }}>
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--a-ink-soft)" }}>
                      {formatLocal(u.createdAt, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="text-right">
                      <RowMenu
                        user={u}
                        onPromote={() => void promote(u.id, "ADMIN")}
                        onRevoke={() => void promote(u.id, "USER")}
                        onFlag={() => setFlagFor(u)}
                        onUnflag={() => void unflag(u.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FlagUserDialog
        open={Boolean(flagFor)}
        userName={flagFor?.displayName ?? flagFor?.email ?? "this player"}
        onCancel={() => setFlagFor(null)}
        onConfirm={async (reason) => {
          if (flagFor) await flag(flagFor.id, reason);
        }}
      />
    </>
  );
}

function RowMenu({
  user,
  onPromote,
  onRevoke,
  onFlag,
  onUnflag,
}: {
  user: AdminUser;
  onPromote: () => void;
  onRevoke: () => void;
  onFlag: () => void;
  onUnflag: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      {user.role === "USER" ? (
        <button onClick={onPromote} className="adm-btn adm-btn--sm">
          Promote
        </button>
      ) : (
        <button onClick={onRevoke} className="adm-btn adm-btn--sm">
          Revoke admin
        </button>
      )}
      {user.flagged ? (
        <button onClick={onUnflag} className="adm-btn adm-btn--sm">
          Unflag
        </button>
      ) : (
        <button
          onClick={onFlag}
          className="adm-btn adm-btn--sm"
          style={{ color: "var(--a-wrong)" }}
        >
          <AdminIcon name="flag" size={12} color="var(--a-wrong)" /> Flag
        </button>
      )}
    </div>
  );
}
