import { NextResponse } from "next/server";
import { addPlayer, getRoom } from "@/lib/db";
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

  const room = await getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended" }, { status: 409 });
  }

  const id = newId();
  await addPlayer({
    id,
    roomId: params.id,
    name: trimmed,
    address: address ?? null,
    joinedAt: Date.now(),
  });

  broadcast(params.id, { type: "player_joined", playerId: id, name: trimmed });

  return NextResponse.json({ playerId: id, name: trimmed });
}
