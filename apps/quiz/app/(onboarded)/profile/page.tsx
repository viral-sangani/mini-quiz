"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BADGE_CATALOG, type BadgeId } from "@mini-quiz/shared";
import { Avatar, avatarColorVar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQCard } from "@/components/MQCard";
import { ProgressBar } from "@/components/ProgressBar";
import { StatTile } from "@/components/StatTile";
import { useProfile } from "@/lib/profile-context";

export default function ProfilePage() {
  const { state } = useProfile();

  if (state.status !== "ready") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
        <Mango pose="think" size={120} />
        <p className="mq-body" style={{ fontSize: 14, marginTop: 12 }}>
          Loading profile…
        </p>
      </div>
    );
  }

  const { profile } = state;
  const earnedIds = useMemo(
    () => new Set(profile.badges.map((b) => b.id as BadgeId)),
    [profile.badges],
  );

  const xpPct =
    profile.xpToNextLevel > 0
      ? (profile.xpInLevel / profile.xpToNextLevel) * 100
      : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "16px 0 24px" }}>
      <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="mq-h2">Profile</h1>
        <Link href="/onboarding/avatar" aria-label="Edit profile">
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "var(--card)",
              border: "2px solid var(--line)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 0 0 var(--line)",
            }}
          >
            <Icon name="list" size={18} color="var(--ink-soft)" />
          </span>
        </Link>
      </div>

      {/* Avatar + name + level chip */}
      <div style={{ padding: "0 16px 16px", textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
          <Avatar
            emoji={profile.avatarEmoji}
            color={profile.avatarColor}
            size={88}
            ring="var(--bg)"
            fallback={profile.displayName?.[0]?.toUpperCase() ?? "🙂"}
          />
          <div
            style={{
              position: "absolute",
              bottom: -4,
              right: -4,
              background: "var(--accent)",
              color: "white",
              padding: "4px 10px",
              borderRadius: 999,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 11,
              border: "2px solid var(--bg)",
            }}
          >
            LVL {profile.level}
          </div>
        </div>
        <h2 className="mq-h2" style={{ fontSize: 22 }}>
          {profile.displayName ?? "Player"}
        </h2>
        {profile.username && (
          <p className="mq-body" style={{ fontSize: 13 }}>
            @{profile.username}
          </p>
        )}
      </div>

      {/* Stat tiles */}
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatTile
          label="WINS"
          value={profile.wins}
          icon="trophy"
          color="var(--gold)"
        />
        <StatTile
          label="QUIZZES"
          value={profile.quizzesPlayed}
          icon="play"
          color="var(--primary)"
        />
        <StatTile
          label="EARNED"
          value={`$${formatUsdt(profile.lifetimeUsdtWon)}`}
          icon="gem"
          color="var(--sky)"
        />
      </div>

      {/* Level progress */}
      <div style={{ padding: "0 16px 12px" }}>
        <MQCard style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14 }}>
              Level {profile.level} → {profile.level + 1}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-soft)" }}>
              {profile.xpInLevel.toLocaleString()} / {profile.xpToNextLevel.toLocaleString()} XP
            </div>
          </div>
          <ProgressBar pct={xpPct} />
          <p className="mq-body" style={{ fontSize: 12, marginTop: 8 }}>
            Total: {profile.totalXp.toLocaleString()} XP · earn more by playing quizzes
          </p>
        </MQCard>
      </div>

      {/* Badges */}
      <div style={{ padding: "0 16px 8px" }}>
        <div className="mq-eyebrow" style={{ marginBottom: 8 }}>Badges</div>
      </div>
      <div
        style={{
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          alignContent: "flex-start",
        }}
      >
        {BADGE_CATALOG.map((b) => {
          const earned = earnedIds.has(b.id);
          return (
            <div key={b.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: earned ? avatarColorVar(b.color) : "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid var(--line)",
                  boxShadow: "inset 0 -3px 0 0 rgba(0,0,0,0.12)",
                }}
                title={b.description}
              >
                <Icon
                  name={(earned ? b.icon : "lock") as IconName}
                  size={26}
                  color={earned ? "white" : "var(--ink-faint)"}
                />
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  color: earned ? "var(--ink)" : "var(--ink-soft)",
                  textAlign: "center",
                }}
              >
                {earned ? b.label : "Locked"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatUsdt(amount: string): string {
  const n = Number(amount || 0);
  if (n === 0) return "0";
  if (n >= 1000) return `${Math.round(n).toLocaleString()}`;
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}
