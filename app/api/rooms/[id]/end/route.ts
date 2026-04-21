import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/events";
import { getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  const db = getDb();
  const room = db.prepare(`SELECT status FROM rooms WHERE id = ?`).get(params.id) as
    | { status: string }
    | undefined;
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status === "ended") return NextResponse.json({ ok: true });

  db.prepare(`UPDATE rooms SET status = 'ended' WHERE id = ?`).run(params.id);
  broadcast(params.id, { type: "leaderboard", rows: getLeaderboard(params.id) });
  broadcast(params.id, { type: "room_ended" });
  return NextResponse.json({ ok: true });
}
