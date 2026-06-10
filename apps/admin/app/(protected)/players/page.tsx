"use client";

import { useEffect, useState } from "react";
import type { AdminUser } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { CustomPill } from "@/components/StatusPill";
import { FlagUserDialog } from "@/components/FlagUserDialog";
import { formatLocal } from "@/lib/time";

type Filter = "all" | "flagged";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
];

const PAGE_SIZE = 10;

type UsersResponse = {
  users: AdminUser[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export default function PlayersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagFor, setFlagFor] = useState<AdminUser | null>(null);
  const toast = useToast();

  const load = async (opts?: { filter?: Filter; search?: string; page?: number }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const eff = opts ?? { filter, search, page };
      if (eff.search) params.set("q", eff.search);
      if (eff.filter === "flagged") params.set("flagged", "true");
      params.set("role", "USER");
      params.set("page", String(eff.page ?? page));
      params.set("limit", String(PAGE_SIZE));
      const data = await adminApi.get<UsersResponse>(
        `/admin/users${params.toString() ? `?${params}` : ""}`,
      );
      const loadedUsers = data.users ?? [];
      const responsePage = data.page ?? eff.page ?? page;
      const responseLimit = data.limit ?? PAGE_SIZE;
      const responseTotal = data.total ?? loadedUsers.length;
      const responseTotalPages = data.totalPages ?? Math.max(1, Math.ceil(responseTotal / responseLimit));
      setUsers(loadedUsers);
      setPagination({
        page: responsePage,
        limit: responseLimit,
        total: responseTotal,
        totalPages: responseTotalPages,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ filter, search, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  const totalPlayers = pagination.total;
  const flaggedCount = users.filter((u) => u.flagged).length;
  const withWalletCount = users.filter((u) => u.walletAddress).length;
  const rangeStart = totalPlayers === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(totalPlayers, rangeStart + users.length - 1);
  const canGoPrev = pagination.page > 1;
  const canGoNext = pagination.page < pagination.totalPages;

  const promote = async (id: string, role: "USER" | "ADMIN") => {
    try {
      await adminApi.patch(`/admin/users/${id}/role`, { role });
      toast.success(role === "ADMIN" ? "Promoted to admin" : "Demoted to user");
      await load({ filter, search, page });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Role update failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const flag = async (id: string, reason: string) => {
    try {
      await adminApi.post(`/admin/users/${id}/flag`, { reason });
      toast.success("Player flagged");
      setFlagFor(null);
      await load({ filter, search, page });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flag failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const unflag = async (id: string) => {
    try {
      await adminApi.post(`/admin/users/${id}/unflag`);
      toast.success("Player unflagged");
      await load({ filter, search, page });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unflag failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const remove = async (u: AdminUser) => {
    const label = u.displayName ?? u.username ?? u.email ?? "this player";
    if (
      !confirm(
        `Delete ${label}? They'll disappear from /players, leaderboards, ` +
          `and lobbies. Their answer + payout history is preserved. ` +
          `Reversible from the database.`,
      )
    ) {
      return;
    }
    try {
      await adminApi.del(`/admin/users/${u.id}`);
      toast.success(`Deleted ${label}`);
      if (users.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await load({ filter, search, page });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <>
      <TopBar title="Players" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Players" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>Players</h1>
            <div className="adm-crumbs">
              Showing {rangeStart.toLocaleString()}-{rangeEnd.toLocaleString()} of{" "}
              {totalPlayers.toLocaleString()} player accounts
            </div>
          </div>
        </div>

        <KpiGrid>
          <KpiCard label="Total matches" value={totalPlayers.toLocaleString()} />
          <KpiCard label="Loaded" value={users.length} delta={`${PAGE_SIZE} per page`} />
          <KpiCard
            label="Flagged loaded"
            value={flaggedCount}
            tone={flaggedCount > 0 ? "down" : "up"}
            delta={flaggedCount > 0 ? "Review needed" : "All clear"}
          />
          <KpiCard
            label="Wallets loaded"
            value={withWalletCount}
          />
        </KpiGrid>

        <div className="adm-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`adm-chip${filter === f.id ? " active" : ""}`}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (page === 1) {
                void load({ filter, search, page: 1 });
              } else {
                setPage(1);
              }
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: "var(--a-ink-faint)", padding: 24 }}>
                    No players match.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
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
                        onDelete={() => void remove(u)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div
            style={{
              alignItems: "center",
              borderTop: "1px solid var(--a-border)",
              display: "flex",
              gap: 10,
              justifyContent: "space-between",
              padding: "12px 14px",
            }}
          >
            <div style={{ color: "var(--a-ink-faint)", fontSize: 12, fontWeight: 700 }}>
              Page {pagination.page.toLocaleString()} of {pagination.totalPages.toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="adm-btn adm-btn--sm"
                disabled={!canGoPrev || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="adm-btn adm-btn--sm"
                disabled={!canGoNext || loading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
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
  onDelete,
}: {
  user: AdminUser;
  onPromote: () => void;
  onRevoke: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onDelete: () => void;
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
      {/* Delete is hidden for ADMIN rows — backend refuses too. Revoke admin first. */}
      {user.role !== "ADMIN" && (
        <button
          onClick={onDelete}
          className="adm-btn adm-btn--sm adm-btn--danger"
          title="Soft-delete this player. Reversible from the database."
        >
          Delete
        </button>
      )}
    </div>
  );
}
