import { answersForPlayer, playersInRoom } from "./db";
import type { LeaderboardRow } from "./events";

export async function getLeaderboard(roomId: string): Promise<LeaderboardRow[]> {
  const players = await playersInRoom(roomId);
  if (!players.length) return [];

  // Fetch per-player answers in parallel — each call is its own Redis mget
  // of that player's answer ids. For ~50 players we do 50 parallel pipelined
  // round-trips, well within Upstash REST limits.
  const answerLists = await Promise.all(players.map((p) => answersForPlayer(p.id)));

  const rows: LeaderboardRow[] = players.map((p, i) => {
    const answers = answerLists[i];
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
