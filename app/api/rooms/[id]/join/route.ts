import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/room-code";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const { name, address } = (await req.json()) as {
    name?: string;
    address?: string;
  };

  const trimmed = (name ?? "").trim().slice(0, 30);
  if (!trimmed) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const db = getDb();
  const room = db.prepare(`SELECT id, status FROM rooms WHERE id = ?`).get(params.id) as
    | { id: string; status: string }
    | undefined;
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended" }, { status: 409 });
  }

  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO players (id, room_id, name, address, joined_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.id, trimmed, address ?? null, now);

  broadcast(params.id, { type: "player_joined", playerId: id, name: trimmed });

  return NextResponse.json({ playerId: id, name: trimmed });
}
