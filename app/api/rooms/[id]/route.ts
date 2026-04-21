import { NextResponse } from "next/server";
import { getRoom, playersInRoom } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const room = getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  return NextResponse.json({
    id: room.id,
    status: room.status,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    durationMs: room.durationMs,
    questionTimeMs: room.questionTimeMs,
    prizeAmounts: room.prizeAmounts,
    playerCount: playersInRoom(params.id).length,
  });
}
