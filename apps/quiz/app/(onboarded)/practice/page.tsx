"use client";

import Link from "next/link";
import { Loader } from "@/components/Loader";
import { Mango } from "@/components/Mango";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { api } from "@/lib/api-client";
import { usePlayerCache } from "@/lib/player-cache";

type Topic = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  questionCount: number;
};

export default function PracticeListPage() {
  // Practice topics rarely change. 5 min stale window keeps tab-jumps
  // instant (no flicker, no loader) and refetches in the background.
  const { data, isLoading, error } = usePlayerCache<{ topics: Topic[] }>(
    "practice-topics",
    () => api.get<{ topics: Topic[] }>("/practice/topics"),
    { staleAfterMs: 5 * 60_000 },
  );

  if (isLoading) return <Loader label="Loading practice…" pose="think" />;
  if (error)
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        <p>{error.message}</p>
      </div>
    );

  const topics = data?.topics ?? [];
  if (topics.length === 0) {
    return (
      <div
        className="mq-page"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        <Mango pose="sleep" size={120} />
        <h1 className="mq-h1">No practice yet</h1>
        <p className="mq-body" style={{ color: "var(--ink-faint)" }}>
          Topics will appear here once admins publish them.
        </p>
      </div>
    );
  }

  return (
    <div className="mq-page" style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 className="mq-h1">Practice</h1>
      <p className="mq-body" style={{ color: "var(--ink-faint)" }}>
        Solo, no leaderboard. Just for the love of it.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 8,
        }}
      >
        {topics.map((t) => (
          <Link
            key={t.id}
            href={`/practice/${t.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <MQCard
              style={{
                padding: 14,
                minHeight: 120,
                background: `var(--${t.coverColor}, var(--primary))`,
                color: "white",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
                {t.title}
              </div>
              {t.description && (
                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                  {t.description}
                </div>
              )}
              <Pill style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                {t.questionCount} qs
              </Pill>
            </MQCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
