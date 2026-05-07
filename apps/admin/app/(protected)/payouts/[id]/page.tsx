"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PayoutStatus } from "@mini-quiz/shared";
import { BLOCKSCOUT_TX } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { PayoutStatusPill } from "@/components/StatusPill";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { formatLocal } from "@/lib/time";

type Detail = {
  payout: {
    id: string;
    quizId: string;
    quizTitle: string;
    quizCode: string;
    prizeAmounts: string[];
    rank: number;
    amount: string;
    tokenAddress: string;
    status: PayoutStatus;
    txHash: string | null;
    confirmedAt: string | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      displayName: string | null;
      username: string | null;
      walletAddress: string | null;
      avatarEmoji: string | null;
      avatarColor: string | null;
      totalXp: number;
      createdAt: string;
      lifetimeUsdt: string;
      gamesPlayed: number;
    };
  };
};

export default function PayoutDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await adminApi.get<Detail>(`/admin/payouts/${params.id}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const retry = async () => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/payouts/${params.id}/approve`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title={data ? `Transaction ${data.payout.id.slice(0, 10)}` : "Payout"}
        crumbs="Payouts"
      />
      <div className="adm-content">
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
        {!data ? (
          <div style={{ color: "var(--a-ink-faint)" }}>Loading…</div>
        ) : (
          <>
            <div className="adm-page-h">
              <div>
                <div className="adm-crumbs">
                  Payouts /{" "}
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>
                    {data.payout.id}
                  </span>
                </div>
                <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  ${data.payout.amount} USDT to{" "}
                  {data.payout.user.displayName ?? "Player"}{" "}
                  <PayoutStatusPill status={data.payout.status} />
                </h1>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--a-ink-soft)",
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  {data.payout.confirmedAt
                    ? `Auto-disbursed at game-end · ${formatLocal(
                        data.payout.confirmedAt,
                      )} · settled in ${payoutSec(
                        data.payout.createdAt,
                        data.payout.confirmedAt,
                      )}s`
                    : `Created ${formatLocal(data.payout.createdAt)}`}
                </div>
              </div>
              <div className="actions">
                {data.payout.txHash && (
                  <a
                    href={BLOCKSCOUT_TX(data.payout.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="adm-btn"
                  >
                    <AdminIcon name="arrow-right" size={14} /> Open in Celoscan
                  </a>
                )}
                {data.payout.status === "FAILED" && data.payout.user.walletAddress && (
                  <button
                    onClick={retry}
                    disabled={busy}
                    className="adm-btn adm-btn--primary"
                  >
                    {busy ? "Retrying…" : "Retry payout"}
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Recipient */}
                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>Recipient</h3>
                  </div>
                  <div
                    style={{
                      padding: 18,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <AdminAvatar
                      emoji={data.payout.user.avatarEmoji}
                      color={data.payout.user.avatarColor}
                      initials={initialsOf(
                        data.payout.user.displayName ?? data.payout.user.username,
                      )}
                      size={56}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: 18,
                        }}
                      >
                        {data.payout.user.displayName ?? "Player"}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--a-ink-soft)",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {data.payout.user.username
                          ? `@${data.payout.user.username}`
                          : "—"}{" "}
                        · player ID {data.payout.user.id.slice(0, 8)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--a-ink-faint)",
                          marginTop: 2,
                        }}
                      >
                        {data.payout.user.gamesPlayed} games · $
                        {data.payout.user.lifetimeUsdt} USDT lifetime · {data.payout.user.totalXp.toLocaleString()} XP
                      </div>
                      {data.payout.user.walletAddress && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--a-ink-faint)",
                            marginTop: 2,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {data.payout.user.walletAddress}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Game result */}
                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>Game result</h3>
                  </div>
                  <div style={{ padding: 18 }}>
                    <table className="adm-table" style={{ borderCollapse: "separate" }}>
                      <tbody>
                        <DetailRow label="Game">
                          <Link
                            href={`/quizzes/${data.payout.quizId}`}
                            className="font-bold no-underline"
                            style={{ color: "var(--a-ink)" }}
                          >
                            {data.payout.quizTitle}
                          </Link>{" "}
                          ·{" "}
                          <span style={{ fontFamily: "ui-monospace, monospace" }}>
                            {data.payout.quizCode}
                          </span>
                        </DetailRow>
                        <DetailRow label="Final rank">
                          <b>{rankLabel(data.payout.rank)}</b>
                        </DetailRow>
                        <DetailRow label="Pool & rule">
                          {data.payout.prizeAmounts.length} ranks · rank{" "}
                          {data.payout.rank} takes <b>${data.payout.amount}</b>
                        </DetailRow>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* On-chain */}
                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>On-chain transaction</h3>
                  </div>
                  <div style={{ padding: 18 }}>
                    <table className="adm-table" style={{ borderCollapse: "separate" }}>
                      <tbody>
                        <DetailRow label="Token">
                          USDT on Celo
                        </DetailRow>
                        <DetailRow label="Token address">
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                            {data.payout.tokenAddress}
                          </span>
                        </DetailRow>
                        <DetailRow label="Tx hash">
                          {data.payout.txHash ? (
                            <a
                              href={BLOCKSCOUT_TX(data.payout.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontFamily: "ui-monospace, monospace",
                                fontSize: 12,
                                color: "var(--a-sky)",
                              }}
                            >
                              {data.payout.txHash}
                            </a>
                          ) : (
                            <span style={{ color: "var(--a-ink-faint)" }}>
                              {data.payout.failureReason ?? "Not yet broadcast"}
                            </span>
                          )}
                        </DetailRow>
                        <DetailRow label="Internal ID">
                          <span style={{ fontFamily: "ui-monospace, monospace" }}>
                            {data.payout.id}
                          </span>
                        </DetailRow>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>Summary</h3>
                  </div>
                  <div style={{ padding: 18 }}>
                    <SummaryRow label="Gross prize" value={`$${data.payout.amount}`} />
                    <SummaryRow
                      label="Platform fee"
                      value="$0.00"
                      sub="0% on cash games"
                    />
                    <SummaryRow label="Network fee" value="$0.00" sub="paid in USDT" />
                    <div
                      style={{
                        height: 1,
                        background: "var(--a-line)",
                        margin: "10px 0",
                      }}
                    />
                    <SummaryRow
                      label="Player received"
                      value={`$${data.payout.amount}`}
                      big
                    />
                  </div>
                </div>

                <div className="adm-card">
                  <div className="adm-card-h">
                    <h3>Timeline</h3>
                  </div>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <Audit
                      t={formatLocal(data.payout.createdAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      what="Payout queued"
                      who="System"
                    />
                    {data.payout.txHash && (
                      <Audit
                        t={formatLocal(data.payout.updatedAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        what="Transfer broadcast"
                        who="Celo"
                      />
                    )}
                    {data.payout.confirmedAt && (
                      <Audit
                        t={formatLocal(data.payout.confirmedAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        what={`Confirmed (${payoutSec(
                          data.payout.createdAt,
                          data.payout.confirmedAt,
                        )}s)`}
                        who="Celo"
                        current
                      />
                    )}
                    {data.payout.status === "FAILED" && (
                      <Audit
                        t={formatLocal(data.payout.updatedAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        what={`Failed: ${data.payout.failureReason ?? "Unknown error"}`}
                        who="Celo"
                        failed
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
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

function payoutSec(createdIso: string, confirmedIso: string): string {
  const sec =
    (new Date(confirmedIso).getTime() - new Date(createdIso).getTime()) / 1000;
  return Number(sec.toFixed(1)).toString();
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td style={{ color: "var(--a-ink-faint)", width: "35%" }}>{label}</td>
      <td>{children}</td>
    </tr>
  );
}

function SummaryRow({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "6px 0",
      }}
    >
      <div>
        <div
          style={{
            fontSize: big ? 13 : 12,
            color: big ? "var(--a-ink)" : "var(--a-ink-soft)",
            fontWeight: big ? 700 : 600,
          }}
        >
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>{sub}</div>
        )}
      </div>
      <div
        className="num"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: big ? 900 : 700,
          fontSize: big ? 22 : 14,
          color: big ? "var(--a-primary)" : "var(--a-ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Audit({
  t,
  who,
  what,
  current,
  failed,
}: {
  t: string;
  who: string;
  what: string;
  current?: boolean;
  failed?: boolean;
}) {
  const dot = failed
    ? "var(--a-wrong)"
    : current
      ? "var(--a-accent)"
      : "var(--a-primary)";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 8,
          background: dot,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{what}</div>
        <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
          {t} · {who}
        </div>
      </div>
    </div>
  );
}
