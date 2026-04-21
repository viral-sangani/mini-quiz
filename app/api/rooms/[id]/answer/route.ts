import { NextResponse } from "next/server";
import {
  getPlayer,
  getQuestion,
  getRoom,
  insertAnswer,
} from "@/lib/db";
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

  const [room, player, question] = await Promise.all([
    getRoom(params.id),
    getPlayer(body.playerId),
    getQuestion(body.questionId),
  ]);

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "Room not live" }, { status: 409 });
  }
  if (!player || player.roomId !== params.id) {
    return NextResponse.json({ error: "Player not in room" }, { status: 403 });
  }
  if (!question || question.roomId !== params.id) {
    return NextResponse.json({ error: "Question not in room" }, { status: 404 });
  }

  const isCorrect = body.choiceId === question.correctChoiceId;
  const timeTakenMs = Math.max(0, Math.min(room.questionTimeMs, body.timeTakenMs));
  const points = computePoints({
    isCorrect,
    timeTakenMs,
    questionTimeMs: room.questionTimeMs,
  });

  const inserted = await insertAnswer({
    playerId: body.playerId,
    questionId: body.questionId,
    choiceId: body.choiceId,
    submittedAt: Date.now(),
    timeTakenMs,
    isCorrect,
    points,
  });
  if (!inserted) {
    return NextResponse.json({ error: "Already answered" }, { status: 409 });
  }

  broadcast(params.id, {
    type: "answer_submitted",
    playerId: player.id,
    name: player.name,
    questionPosition: question.position,
    isCorrect,
  });

  const rows = await getLeaderboard(params.id);
  broadcast(params.id, { type: "leaderboard", rows });

  return NextResponse.json({ isCorrect, points });
}
