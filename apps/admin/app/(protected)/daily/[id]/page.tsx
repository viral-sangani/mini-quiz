"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { DailyForm, type DailyQuestion } from "@/components/admin/DailyForm";
import type { LeaderboardRow } from "@mini-quiz/shared";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";

type Detail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  date: string | null;
  playerCount: number;
  questions: (DailyQuestion & { id: string; position: number })[];
};

export default function DailyEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const d = await adminApi.get<Detail>(`/admin/daily/${id}`);
        if (!cancel) setDetail(d);
        try {
          const lb = await adminApi.get<{ rows: LeaderboardRow[] }>(
            `/admin/daily/${id}/leaderboard`,
          );
          if (!cancel) setLeaderboard(lb.rows);
        } catch {
          // no leaderboard yet
        }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  if (error) {
    return (
      <>
        <TopBar title="Daily quiz" />
        <div className="adm-content">
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)" }}>
            {error}
          </div>
        </div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <TopBar title="Daily quiz" />
        <div className="adm-content">
          <div className="adm-card" style={{ padding: 18 }}>Loading…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Daily quiz" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>{detail.title}</h1>
            <div className="adm-crumbs">Daily › {detail.date}</div>
          </div>
        </div>
        <DailyForm
          mode="edit"
          initial={{
            id: detail.id,
            title: detail.title,
            description: detail.description,
            date: detail.date,
            status: detail.status,
            questions: detail.questions.map((q) => ({
              prompt: q.prompt,
              choices: q.choices,
              correctChoiceId: q.correctChoiceId,
            })),
          }}
        />

        {leaderboard && leaderboard.length > 0 && (
          <div className="adm-card" style={{ marginTop: 18 }}>
            <div className="adm-card-h">
              <h3>Leaderboard ({detail.status === "ENDED" ? "final" : "live"})</h3>
              <span style={{ color: "var(--a-ink-faint)", fontSize: 12 }}>
                {detail.playerCount} players
              </span>
            </div>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Correct</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 20).map((row, i) => (
                  <tr key={row.userId}>
                    <td>{i + 1}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AdminAvatar
                          color={row.avatarColor ?? "berry"}
                          initials={initialsOf(row.displayName)}
                        />
                        {row.displayName}
                      </div>
                    </td>
                    <td>
                      {row.correctCount}/{row.answeredCount}
                    </td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
