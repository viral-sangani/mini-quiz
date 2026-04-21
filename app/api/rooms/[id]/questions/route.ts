import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// Returns questions WITHOUT the correct answer — safe for players.
export async function GET(_req: Request, { params }: Params) {
  const db = getDb();
  const room = db.prepare(`SELECT id FROM rooms WHERE id = ?`).get(params.id) as
    | { id: string }
    | undefined;
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const rows = db
    .prepare(
      `SELECT id, position, prompt, choices_json AS choicesJson
       FROM questions WHERE room_id = ? ORDER BY position ASC`
    )
    .all(params.id) as { id: number; position: number; prompt: string; choicesJson: string }[];

  return NextResponse.json({
    questions: rows.map((r) => ({
      id: r.id,
      position: r.position,
      prompt: r.prompt,
      choices: JSON.parse(r.choicesJson) as { id: string; label: string }[],
    })),
  });
}
