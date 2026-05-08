"use client";

import Link from "next/link";
import { Loader } from "@/components/Loader";
import { Mango } from "@/components/Mango";
import { MQCard } from "@/components/MQCard";
import { Pill } from "@/components/Pill";
import { api } from "@/lib/api-client";
import { usePlayerCache } from "@/lib/player-cache";

type Quiz = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  questionCount: number;
};

export default function PracticeListPage() {
  // Practice quizzes rarely change. 5 min stale window keeps tab-jumps
  // instant (no flicker, no loader) and refetches in the background.
  const { data, isLoading, error } = usePlayerCache<{ quizzes: Quiz[] }>(
    "practice-quizzes",
    () => api.get<{ quizzes: Quiz[] }>("/practice/quizzes"),
    { staleAfterMs: 5 * 60_000 },
  );

  if (isLoading) return <Loader label="Loading practice…" pose="think" />;
  if (error)
    return (
      <div className="mq-page" style={{ padding: 16 }}>
        <p>{error.message}</p>
      </div>
    );

  const quizzes = data?.quizzes ?? [];
  if (quizzes.length === 0) {
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
        <h1 className="mq-h1">Nothing here yet</h1>
        <p className="mq-body" style={{ color: "var(--ink-faint)" }}>
          New practice quizzes are on the way — check back soon.
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
        {quizzes.map((q) => (
          <Link
            key={q.id}
            href={`/practice/${q.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <MQCard
              style={{
                padding: 14,
                minHeight: 120,
                background: `var(--${q.coverColor}, var(--primary))`,
                color: "white",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
                {q.title}
              </div>
              {q.description && (
                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                  {q.description}
                </div>
              )}
              <Pill style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                {q.questionCount} qs
              </Pill>
            </MQCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
