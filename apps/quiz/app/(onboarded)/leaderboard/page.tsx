"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GlobalLeaderboardPeriod,
  GlobalLeaderboardRow,
} from "@mini-quiz/shared";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQCard } from "@/components/MQCard";
import { SegmentedControl } from "@/components/SegmentedControl";
import { api } from "@/lib/api-client";
import { useProfile } from "@/lib/profile-context";

type Resp = { rows: GlobalLeaderboardRow[]; viewer: GlobalLeaderboardRow | null };

export default function LeaderboardPage() {
  const { state } = useProfile();
  const viewerUserId =
    state.status === "ready" || state.status === "needs-onboarding"
      ? state.user.id
      : null;

  const [period, setPeriod] = useState<GlobalLeaderboardPeriod>("today");
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    async function load() {
      try {
        const qs = new URLSearchParams({ period });
        if (viewerUserId) qs.set("viewerUserId", viewerUserId);
        const res = await api.get<Resp>(`/leaderboard?${qs.toString()}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load leaderboard");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, viewerUserId]);

  const top3 = useMemo(() => (data?.rows ?? []).slice(0, 3), [data]);
  const list = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "16px 0 0" }}>
      <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="mq-h2">Leaderboard</h1>
        <Icon name="trophy" size={22} color="var(--accent)" />
      </div>

      {/* Top-3 podium chip */}
      {top3.length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--berry))",
              borderRadius: 22,
              padding: "16px 14px 12px",
              color: "white",
              border: "2px solid var(--accent-shade)",
              boxShadow: "0 4px 0 0 var(--accent-shade)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around" }}>
              {[1, 0, 2].map((rankIndex) => {
                const r = top3[rankIndex];
                if (!r) return <div key={rankIndex} style={{ flex: 1 }} />;
                const isFirst = rankIndex === 0;
                return (
                  <div key={r.user.id} style={{ textAlign: "center", flex: 1, transform: isFirst ? "scale(1.1)" : "none" }}>
                    {isFirst && (
                      <div style={{ marginBottom: 2 }}>
                        <Icon name="crown" size={20} color="white" />
                      </div>
                    )}
                    <Avatar
                      emoji={r.user.avatarEmoji}
                      color={r.user.avatarColor}
                      size={isFirst ? 56 : 44}
                      ring="white"
                      fallback={initial(r.user.displayName)}
                    />
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12, marginTop: 4 }}>
                      {r.user.displayName ?? r.user.username ?? "Player"}
                    </div>
                    <div className="mq-num" style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                      {r.points.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 16px 12px" }}>
        <SegmentedControl
          value={period}
          options={[
            { value: "today" as const, label: "Today" },
            { value: "week" as const, label: "Week" },
            { value: "all" as const, label: "All time" },
          ]}
          onChange={setPeriod}
        />
      </div>

      <div
        style={{
          padding: "4px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {data === null ? (
          <SkeletonRows />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          list.map((p) => (
            <Row
              key={p.user.id}
              row={p}
              isMe={viewerUserId === p.user.id}
            />
          ))
        )}
        {error && (
          <div style={{ color: "var(--wrong-shade)", fontSize: 13, fontWeight: 800, textAlign: "center", padding: 8 }}>
            {error}
          </div>
        )}

        {/* Viewer row pinned at the bottom if not in the top list */}
        {data?.viewer && !list.some((r) => r.user.id === data.viewer!.user.id) && (
          <>
            <div style={{ marginTop: 12, fontSize: 11, fontWeight: 800, color: "var(--ink-soft)", textAlign: "center", letterSpacing: 0.1 }}>
              YOUR RANK
            </div>
            <Row row={data.viewer} isMe />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ row, isMe }: { row: GlobalLeaderboardRow; isMe: boolean }) {
  return (
    <MQCard
      style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: isMe ? "var(--primary)" : undefined,
        borderColor: isMe ? "var(--primary-shade)" : undefined,
        boxShadow: isMe ? "0 3px 0 0 var(--primary-shade)" : undefined,
        color: isMe ? "white" : undefined,
      }}
    >
      <div
        className="mq-num"
        style={{
          width: 28,
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 14,
          color: isMe ? "white" : "var(--ink-soft)",
        }}
      >
        {row.rank}
      </div>
      <Avatar
        emoji={row.user.avatarEmoji}
        color={row.user.avatarColor}
        size={32}
        fallback={initial(row.user.displayName)}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14 }}>
          {row.user.displayName ?? row.user.username ?? "Player"}
        </div>
        {row.user.username && (
          <div style={{ fontSize: 11, fontWeight: 700, opacity: isMe ? 0.85 : 0.7 }}>
            @{row.user.username} · Lv {row.level}
          </div>
        )}
      </div>
      <div className="mq-num" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14 }}>
        {row.points.toLocaleString()}
      </div>
    </MQCard>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 56,
            background: "var(--card)",
            border: "2px solid var(--line)",
            borderRadius: 22,
            opacity: 0.55,
          }}
        />
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", textAlign: "center" }}>
      <Mango pose="think" size={120} />
      <div className="mq-h3" style={{ marginTop: 12 }}>Be the first</div>
      <p className="mq-body" style={{ fontSize: 13, marginTop: 4 }}>
        Nobody&apos;s on the board yet for this period.
      </p>
    </div>
  );
}

function initial(name: string | null): string {
  return name?.[0]?.toUpperCase() ?? "•";
}
