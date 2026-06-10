"use client";

import { useEffect, useState } from "react";
import type {
  AdminUser,
  AdminUsersResponse,
  AdminUsersStats,
} from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { formatLocal } from "@/lib/time";

type Tab = "players" | "admins";

const PAGE_SIZE = 10;

const TABS: { id: Tab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "admins", label: "Admin" },
];

const EMPTY_STATS: AdminUsersStats = {
  totalPlayers: 0,
  totalAdmins: 0,
  playersLast24h: 0,
  walletsConnected: 0,
  totalMatchesPlayed: 0,
};

type AdminUsersWireResponse = Omit<AdminUsersResponse, "stats"> & {
  stats?: AdminUsersStats;
};

const EMPTY_PAGINATION = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

function roleFor(tab: Tab): "USER" | "ADMIN" {
  return tab === "admins" ? "ADMIN" : "USER";
}

function isUserJoinedLast24h(user: AdminUser): boolean {
  const joinedAt = new Date(user.createdAt).getTime();
  return Number.isFinite(joinedAt) && Date.now() - joinedAt < 24 * 60 * 60 * 1000;
}

function fallbackStatsForLegacyResponse(
  targetTab: Tab,
  total: number,
  users: AdminUser[],
  previous: AdminUsersStats,
): AdminUsersStats {
  return {
    ...previous,
    totalPlayers: targetTab === "players" ? total : previous.totalPlayers,
    totalAdmins: targetTab === "admins" ? total : previous.totalAdmins,
    playersLast24h:
      targetTab === "players"
        ? users.filter(isUserJoinedLast24h).length
        : previous.playersLast24h,
  };
}

function formatJoinedAt(value: string): string {
  const joinedAt = new Date(value).getTime();
  if (!Number.isFinite(joinedAt)) return "-";
  const elapsedMs = Date.now() - joinedAt;
  if (elapsedMs < 0) return "just now";
  if (elapsedMs < 24 * 60 * 60 * 1000) {
    const seconds = Math.max(1, Math.floor(elapsedMs / 1000));
    if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  return formatLocal(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PlayersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<Tab>("players");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Record<Tab, number>>({
    players: 1,
    admins: 1,
  });
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [stats, setStats] = useState<AdminUsersStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = async (opts?: { tab?: Tab; search?: string; page?: number }) => {
    setLoading(true);
    try {
      const targetTab = opts?.tab ?? tab;
      const targetSearch = opts?.search ?? search;
      const targetPage = opts?.page ?? pages[targetTab];
      const params = new URLSearchParams({
        role: roleFor(targetTab),
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      });
      if (targetSearch.trim()) params.set("q", targetSearch.trim());

      const data = await adminApi.get<AdminUsersWireResponse>(`/admin/users?${params}`);
      const loadedUsers = Array.isArray(data.users) ? data.users : [];
      const responsePage = data.page ?? targetPage;
      const responseLimit = data.limit ?? PAGE_SIZE;
      const responseTotal = data.total ?? loadedUsers.length;
      const responseTotalPages =
        data.totalPages ?? Math.max(1, Math.ceil(responseTotal / responseLimit));
      setUsers(loadedUsers);
      setStats((previous) =>
        data.stats ??
        fallbackStatsForLegacyResponse(targetTab, responseTotal, loadedUsers, previous),
      );
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
    void load({ tab, search, page: pages[tab] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pages.players, pages.admins]);

  const setPageForTab = (nextPage: number) => {
    setPages((prev) => ({ ...prev, [tab]: nextPage }));
  };

  const rangeStart =
    pagination.total === 0 || users.length === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(
    pagination.total,
    rangeStart + Math.max(0, users.length - 1),
  );
  const canGoPrev = pagination.page > 1;
  const canGoNext = pagination.page < pagination.totalPages;
  const activeLabel = tab === "admins" ? "admins" : "players";
  const walletRate =
    stats.totalPlayers === 0
      ? "0%"
      : `${Math.round((stats.walletsConnected / stats.totalPlayers) * 100)}%`;

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
      if (users.length === 1 && pages.players > 1) {
        setPages((prev) => ({ ...prev, players: prev.players - 1 }));
      } else {
        await load({ tab: "players", search, page: pages.players });
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
              {pagination.total.toLocaleString()} matching {activeLabel}
            </div>
          </div>
        </div>

        <KpiGrid>
          <KpiCard
            label="Total players"
            value={stats.totalPlayers.toLocaleString()}
          />
          <KpiCard
            label="New players"
            value={stats.playersLast24h.toLocaleString()}
            delta="Last 24 hours"
            tone={stats.playersLast24h > 0 ? "up" : "neutral"}
          />
          <KpiCard
            label="Wallets loaded"
            value={stats.walletsConnected.toLocaleString()}
            delta={`${walletRate} of players`}
            tone="neutral"
          />
          <KpiCard
            label="Matches played"
            value={stats.totalMatchesPlayed.toLocaleString()}
            delta="Live quiz entries"
            tone="neutral"
          />
          <KpiCard
            label="Admins"
            value={stats.totalAdmins.toLocaleString()}
            delta="Active console users"
            tone="neutral"
          />
        </KpiGrid>

        <div className="adm-filters">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`adm-chip${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const currentPage = pages[tab];
              if (currentPage === 1) {
                void load({ tab, search, page: 1 });
              } else {
                setPageForTab(1);
              }
            }}
            className="adm-search"
            style={{ maxWidth: 320 }}
          >
            <AdminIcon name="search" size={13} color="var(--a-ink-faint)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, username, wallet..."
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

        <PeopleTable
          mode={tab}
          users={users}
          loading={loading}
          onDelete={(user) => void remove(user)}
        />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            padding: "12px 14px",
          }}
        >
          <div style={{ color: "var(--a-ink-faint)", fontSize: 12, fontWeight: 700 }}>
            Page {pagination.page.toLocaleString()} of{" "}
            {pagination.totalPages.toLocaleString()} · {PAGE_SIZE} per page
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="adm-btn adm-btn--sm"
              disabled={!canGoPrev || loading}
              onClick={() => setPageForTab(Math.max(1, pagination.page - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="adm-btn adm-btn--sm"
              disabled={!canGoNext || loading}
              onClick={() =>
                setPageForTab(Math.min(pagination.totalPages, pagination.page + 1))
              }
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function PeopleTable({
  mode,
  users,
  loading,
  onDelete,
}: {
  mode: Tab;
  users: AdminUser[];
  loading: boolean;
  onDelete: (user: AdminUser) => void;
}) {
  const colSpan = 5;
  return (
    <div className="adm-card">
      <table className="adm-table">
        <thead>
          <tr>
            <th>{mode === "admins" ? "Admin" : "Player"}</th>
            <th>{mode === "admins" ? "Email" : "Username"}</th>
            <th>Wallet</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={colSpan}
                className="text-center"
                style={{ color: "var(--a-ink-faint)", padding: 24 }}
              >
                Loading...
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="text-center"
                style={{ color: "var(--a-ink-faint)", padding: 24 }}
              >
                No {mode === "admins" ? "admins" : "players"} match.
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AdminAvatar
                      emoji={u.avatarEmoji}
                      color={u.avatarColor ?? (mode === "admins" ? "berry" : null)}
                      initials={initialsOf(
                        u.displayName ?? u.email ?? u.username ?? "??",
                      )}
                    />
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {u.displayName ?? u.name ?? u.email ?? "Player"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                        {mode === "admins" ? "Admin account" : "Latest player account"}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--a-ink-soft)",
                    fontSize: 12,
                  }}
                >
                  {mode === "admins"
                    ? u.email ?? "-"
                    : u.username
                      ? `@${u.username}`
                      : "-"}
                </td>
                <td
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    color: "var(--a-ink-soft)",
                  }}
                >
                  {u.walletAddress
                    ? `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}`
                    : "-"}
                </td>
                <td style={{ fontSize: 12, color: "var(--a-ink-soft)" }}>
                  {formatJoinedAt(u.createdAt)}
                </td>
                <td className="text-right">
                  {mode === "players" ? (
                    <button
                      onClick={() => onDelete(u)}
                      className="adm-btn adm-btn--sm adm-btn--danger"
                      title="Soft-delete this player. Reversible from the database."
                      type="button"
                    >
                      Delete
                    </button>
                  ) : (
                    <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
                      -
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
