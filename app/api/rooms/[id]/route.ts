import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const db = getDb();
  const room = db
    .prepare(
      `SELECT id, status, started_at AS startedAt, ends_at AS endsAt,
              duration_ms AS durationMs, question_time_ms AS questionTimeMs,
              prize_amounts_json AS prizeAmountsJson
       FROM rooms WHERE id = ?`
    )
    .get(params.id) as
    | {
        id: string;
        status: string;
        startedAt: number | null;
        endsAt: number | null;
        durationMs: number;
        questionTimeMs: number;
        prizeAmountsJson: string;
      }
    | undefined;

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const playerCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM players WHERE room_id = ?`).get(params.id) as { c: number }
  ).c;

  return NextResponse.json({
    id: room.id,
    status: room.status,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    durationMs: room.durationMs,
    questionTimeMs: room.questionTimeMs,
    prizeAmounts: JSON.parse(room.prizeAmountsJson) as string[],
    playerCount,
  });
}
