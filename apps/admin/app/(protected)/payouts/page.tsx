"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminStats, PayoutStatus, PayoutTokenSymbol } from "@mini-quiz/shared";
import { BLOCKSCOUT_TX } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { PayoutFailureCell } from "@/components/PayoutFailureCell";
import { useToast } from "@/components/Toast";
import { TreasurySection } from "@/components/admin/TreasurySection";
import { KpiCard, KpiGrid } from "@/components/KpiCard";
import { PayoutStatusPill } from "@/components/StatusPill";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { formatLocal } from "@/lib/time";

type AdminPayoutRow = {
  id: string;
  quizId: string;
  quizTitle: string;
  quizCode: string;
  payoutToken: PayoutTokenSymbol;
  rank: number;
  amount: string;
  tokenAddress: string;
  status: PayoutStatus;
  txHash: string | null;
  confirmedAt: string | null;
  userId: string;
  displayName: string;
  walletAddress: string | null;
  approvedById: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Filter = "ALL" | "FAILED" | "CONFIRMED" | "PROCESSING";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "FAILED", label: "Failed" },
  { id: "CONFIRMED", label: "Paid" },
  { id: "PROCESSING", label: "In flight" },
];

export default function PayoutsPage() {
  const [rows, setRows] = useState<AdminPayoutRow[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        adminApi.get<{ payouts: AdminPayoutRow[] }>(`/admin/payouts`),
        adminApi.get<AdminStats>(`/admin/stats`),
      ]);
      setRows(data.payouts);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    if (filter === "ALL") return rows;
    if (filter === "FAILED") return rows.filter((r) => r.status === "FAILED");
    if (filter === "CONFIRMED")
      return rows.filter((r) => r.status === "CONFIRMED");
    return rows.filter(
      (r) =>
        r.status === "PENDING" || r.status === "APPROVED" || r.status === "BROADCAST",
    );
  }, [rows, filter]);

  const retry = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await adminApi.post(`/admin/payouts/${id}/approve`);
      toast.success("Payout queued for retry");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Retry failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <TopBar title="Payouts" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Payouts" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>Payouts</h1>
            <div
              className="adm-crumbs"
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  background: "var(--a-primary-tint)",
                  color: "var(--a-primary)",
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                <AdminIcon name="check" size={11} color="var(--a-primary)" /> AUTO-DISBURSE ON
              </span>
              Winners are paid the moment a game ends. Admins read this ledger — no approvals needed.
            </div>
          </div>
        </div>

        <TreasurySection />

        <KpiGrid>
          <KpiCard
            label="Auto-paid today"
            value={stats ? `$${stats.kpis.paidUsdtToday}` : "—"}
            delta={
              stats
                ? `${
                    rows.filter(
                      (r) =>
                        r.status === "CONFIRMED" &&
                        r.confirmedAt &&
                        new Date(r.confirmedAt).toDateString() === new Date().toDateString(),
                    ).length
                  } payouts`
                : "—"
            }
          />
          <KpiCard
            label="Avg payout time"
            value={
              stats?.kpis.avgPayoutSeconds != null
                ? `${stats.kpis.avgPayoutSeconds}s`
                : "—"
            }
          />
          <KpiCard
            label="Failed · needs fix"
            value={stats?.kpis.failedPayoutsToday ?? 0}
            delta={
              stats?.kpis.failedUsdtToday != null
                ? `$${stats.kpis.failedUsdtToday} stuck`
                : ""
            }
            tone={
              stats && stats.kpis.failedPayoutsToday > 0 ? "down" : "up"
            }
          />
          <KpiCard
            label="Paid this month"
            value={stats ? `$${stats.kpis.paidUsdtThisMonth}` : "—"}
          />
        </KpiGrid>

        <div className="adm-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`adm-chip${filter === f.id ? " active" : ""}`}
              style={
                f.id === "FAILED"
                  ? {
                      background:
                        filter === "FAILED" ? "var(--a-wrong)" : "var(--a-wrong-tint)",
                      color: filter === "FAILED" ? "white" : "var(--a-wrong)",
                      borderColor: "var(--a-wrong)",
                    }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
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
                <th>Status</th>
                <th>Player</th>
                <th>Game</th>
                <th>Rank</th>
                <th className="num">Amount</th>
                <th>Tx</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center"
                    style={{ color: "var(--a-ink-faint)", padding: 24 }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center"
                    style={{ color: "var(--a-ink-faint)", padding: 24 }}
                  >
                    No payouts in this view.
                  </td>
                </tr>
              ) : (
                visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <PayoutStatusPill status={p.status} />
                      <PayoutFailureCell reason={p.failureReason} />
                      {p.confirmedAt && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--a-ink-faint)",
                            marginTop: 2,
                            fontWeight: 600,
                          }}
                        >
                          in {payoutDuration(p.createdAt, p.confirmedAt)}s
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AdminAvatar
                          color="berry"
                          initials={initialsOf(p.displayName)}
                        />
                        <div>
                          <div style={{ fontWeight: 700 }}>{p.displayName}</div>
                          {p.walletAddress && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--a-ink-faint)",
                                fontFamily: "ui-monospace, monospace",
                              }}
                            >
                              {p.walletAddress.slice(0, 6)}…{p.walletAddress.slice(-4)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/quizzes/${p.quizId}`}
                        className="font-semibold no-underline"
                        style={{ color: "var(--a-ink)" }}
                      >
                        {p.quizTitle}
                      </Link>
                      <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                        {p.quizCode}
                      </div>
                    </td>
                    <td>{rankLabel(p.rank)}</td>
                    <td
                      className="num"
                      style={{
                        fontWeight: 800,
                        fontFamily: "var(--font-display)",
                        fontSize: 14,
                      }}
                    >
                      ${p.amount}
                      <span style={{ marginLeft: 4, fontSize: 11, color: "var(--a-ink-soft)" }}>
                        {p.payoutToken}
                      </span>
                    </td>
                    <td>
                      {p.txHash ? (
                        <a
                          href={BLOCKSCOUT_TX(p.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 11,
                            color: "var(--a-sky)",
                          }}
                        >
                          {p.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span style={{ color: "var(--a-ink-faint)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--a-ink-soft)" }}>
                      {formatLocal(p.confirmedAt ?? p.createdAt, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="text-right">
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <Link
                          href={`/payouts/${p.id}`}
                          className="adm-btn adm-btn--sm"
                          aria-label="View detail"
                        >
                          <AdminIcon name="eye" size={12} />
                        </Link>
                        {(p.status === "FAILED" || p.status === "PENDING") &&
                          p.walletAddress && (
                            <button
                              onClick={() => retry(p.id)}
                              disabled={busyId === p.id}
                              className="adm-btn adm-btn--sm"
                            >
                              {busyId === p.id ? "Retrying…" : "Retry"}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function payoutDuration(createdIso: string, confirmedIso: string): string {
  const sec =
    (new Date(confirmedIso).getTime() - new Date(createdIso).getTime()) / 1000;
  return Number(sec.toFixed(1)).toString();
}
