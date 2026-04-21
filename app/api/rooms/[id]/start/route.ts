import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  const db = getDb();
  const room = db
    .prepare(`SELECT id, status, duration_ms FROM rooms WHERE id = ?`)
    .get(params.id) as { id: string; status: string; duration_ms: number } | undefined;

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "lobby") {
    return NextResponse.json({ error: "Room already started" }, { status: 409 });
  }

  const startedAt = Date.now();
  const endsAt = startedAt + room.duration_ms;
  db.prepare(
    `UPDATE rooms SET status = 'live', started_at = ?, ends_at = ? WHERE id = ?`
  ).run(startedAt, endsAt, params.id);

  broadcast(params.id, { type: "room_started", startedAt, endsAt });

  return NextResponse.json({ startedAt, endsAt });
}
