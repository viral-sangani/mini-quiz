import { NextResponse } from "next/server";
import { getRoom, updateRoom } from "@/lib/db";
import { broadcast } from "@/lib/events";
import { getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  const room = await getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status === "ended") return NextResponse.json({ ok: true });

  await updateRoom(params.id, { status: "ended" });
  broadcast(params.id, { type: "leaderboard", rows: await getLeaderboard(params.id) });
  broadcast(params.id, { type: "room_ended" });
  return NextResponse.json({ ok: true });
}
