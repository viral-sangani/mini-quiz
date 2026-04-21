import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { newRoomCode } from "@/lib/room-code";
import { SEED_QUESTIONS } from "@/lib/seed-questions";
import { isHostAddress } from "@/lib/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DURATION_MS = 3 * 60 * 1000; // 3 min total
const DEFAULT_QUESTION_TIME_MS = 15_000;
const DEFAULT_PRIZES = ["50", "25", "10"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    durationMs?: number;
    questionTimeMs?: number;
    prizeAmounts?: string[];
    hostAddress?: string;
  };

  const headerAddress = req.headers.get("x-host-address");
  const caller = body.hostAddress ?? headerAddress ?? null;
  if (!isHostAddress(caller)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const db = getDb();
  const now = Date.now();
  const roomId = newRoomCode();

  db.prepare(
    `INSERT INTO rooms (id, status, duration_ms, question_time_ms, prize_amounts_json, created_at)
     VALUES (?, 'lobby', ?, ?, ?, ?)`
  ).run(
    roomId,
    body.durationMs ?? DEFAULT_DURATION_MS,
    body.questionTimeMs ?? DEFAULT_QUESTION_TIME_MS,
    JSON.stringify(body.prizeAmounts ?? DEFAULT_PRIZES),
    now
  );

  const insertQ = db.prepare(
    `INSERT INTO questions (room_id, position, prompt, choices_json, correct_choice_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    SEED_QUESTIONS.forEach((q, i) => {
      insertQ.run(roomId, i, q.prompt, JSON.stringify(q.choices), q.correctChoiceId);
    });
  });
  tx();

  return NextResponse.json({ roomId });
}
