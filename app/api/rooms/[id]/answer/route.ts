import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/events";
import { computePoints } from "@/lib/scoring";
import { getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const body = (await req.json()) as {
    playerId: string;
    questionId: number;
    choiceId: string;
    timeTakenMs: number;
  };
  if (!body.playerId || !body.questionId || !body.choiceId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const room = db
    .prepare(
      `SELECT status, ends_at AS endsAt, question_time_ms AS questionTimeMs FROM rooms WHERE id = ?`
    )
    .get(params.id) as
    | { status: string; endsAt: number | null; questionTimeMs: number }
    | undefined;
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "Room not live" }, { status: 409 });
  }

  const player = db
    .prepare(`SELECT id, name FROM players WHERE id = ? AND room_id = ?`)
    .get(body.playerId, params.id) as { id: string; name: string } | undefined;
  if (!player) return NextResponse.json({ error: "Player not in room" }, { status: 403 });

  const question = db
    .prepare(
      `SELECT id, position, correct_choice_id AS correctChoiceId
       FROM questions WHERE id = ? AND room_id = ?`
    )
    .get(body.questionId, params.id) as
    | { id: number; position: number; correctChoiceId: string }
    | undefined;
  if (!question) return NextResponse.json({ error: "Question not in room" }, { status: 404 });

  const isCorrect = body.choiceId === question.correctChoiceId;
  const timeTakenMs = Math.max(0, Math.min(room.questionTimeMs, body.timeTakenMs));
  const points = computePoints({
    isCorrect,
    timeTakenMs,
    questionTimeMs: room.questionTimeMs,
  });

  try {
    db.prepare(
      `INSERT INTO answers (player_id, question_id, choice_id, submitted_at, time_taken_ms, is_correct, points)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.playerId,
      body.questionId,
      body.choiceId,
      Date.now(),
      timeTakenMs,
      isCorrect ? 1 : 0,
      points
    );
  } catch (e) {
    // UNIQUE constraint → already answered
    return NextResponse.json({ error: "Already answered" }, { status: 409 });
  }

  broadcast(params.id, {
    type: "answer_submitted",
    playerId: player.id,
    name: player.name,
    questionPosition: question.position,
    isCorrect,
  });

  broadcast(params.id, { type: "leaderboard", rows: getLeaderboard(params.id) });

  return NextResponse.json({ isCorrect, points });
}
