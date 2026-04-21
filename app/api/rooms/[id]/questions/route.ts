import { NextResponse } from "next/server";
import { getRoom, questionsInRoom } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const room = getRoom(params.id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const rows = questionsInRoom(params.id);
  return NextResponse.json({
    questions: rows.map((r) => ({
      id: r.id,
      position: r.position,
      prompt: r.prompt,
      choices: r.choices,
    })),
  });
}
