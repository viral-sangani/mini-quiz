import { getDb } from "./db";
import type { LeaderboardRow } from "./events";

export function getLeaderboard(roomId: string): LeaderboardRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        p.id AS playerId,
        p.name AS name,
        p.address AS address,
        COALESCE(SUM(a.points), 0) AS points,
        COALESCE(SUM(a.is_correct), 0) AS correctCount,
        COUNT(a.id) AS answeredCount,
        COALESCE(SUM(a.time_taken_ms), 0) AS totalTimeMs
      FROM players p
      LEFT JOIN answers a ON a.player_id = p.id
      WHERE p.room_id = ?
      GROUP BY p.id
      ORDER BY points DESC, totalTimeMs ASC, p.joined_at ASC`
    )
    .all(roomId) as LeaderboardRow[];
  return rows;
}
