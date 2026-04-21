import { NextResponse } from "next/server";
import { getRoom, updateRoom } from "@/lib/db";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  const room = await getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "lobby") {
    return NextResponse.json({ error: "Room already started" }, { status: 409 });
  }

  const startedAt = Date.now();
  const endsAt = startedAt + room.durationMs;
  await updateRoom(params.id, { status: "live", startedAt, endsAt });

  broadcast(params.id, { type: "room_started", startedAt, endsAt });

  return NextResponse.json({ startedAt, endsAt });
}
