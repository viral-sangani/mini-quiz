import { answersForPlayer, playersInRoom } from "./db";
import type { LeaderboardRow } from "./events";

export function getLeaderboard(roomId: string): LeaderboardRow[] {
  const players = playersInRoom(roomId);
  const rows: LeaderboardRow[] = players.map((p) => {
    const answers = answersForPlayer(p.id);
    let points = 0;
    let correctCount = 0;
    let totalTimeMs = 0;
    for (const a of answers) {
      points += a.points;
      if (a.isCorrect) correctCount += 1;
      totalTimeMs += a.timeTakenMs;
    }
    return {
      playerId: p.id,
      name: p.name,
      address: p.address,
      points,
      correctCount,
      answeredCount: answers.length,
      totalTimeMs,
    };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
    return 0;
  });
  return rows;
}
