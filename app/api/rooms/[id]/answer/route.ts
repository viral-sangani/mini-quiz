import { NextResponse } from "next/server";
import {
  existingAnswer,
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

  const room = getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "Room not live" }, { status: 409 });
  }

  const player = getPlayer(body.playerId);
  if (!player || player.roomId !== params.id) {
    return NextResponse.json({ error: "Player not in room" }, { status: 403 });
  }

  const question = getQuestion(body.questionId);
  if (!question || question.roomId !== params.id) {
    return NextResponse.json({ error: "Question not in room" }, { status: 404 });
  }

  if (existingAnswer(body.playerId, body.questionId)) {
    return NextResponse.json({ error: "Already answered" }, { status: 409 });
  }

  const isCorrect = body.choiceId === question.correctChoiceId;
  const timeTakenMs = Math.max(0, Math.min(room.questionTimeMs, body.timeTakenMs));
  const points = computePoints({
    isCorrect,
    timeTakenMs,
    questionTimeMs: room.questionTimeMs,
  });

  insertAnswer({
    playerId: body.playerId,
    questionId: body.questionId,
    choiceId: body.choiceId,
    submittedAt: Date.now(),
    timeTakenMs,
    isCorrect,
    points,
  });

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
