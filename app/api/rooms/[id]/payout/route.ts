import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const body = (await req.json()) as {
    playerId: string;
    rank: number;
    amount: string;
    txHash: string;
    confirmed?: boolean;
  };
  if (!body.playerId || !body.rank || !body.amount || !body.txHash) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();
  const confirmed = body.confirmed ? now : null;

  // Upsert by (roomId, rank) — first insert captures "sent", subsequent call marks confirmed.
  const existing = db
    .prepare(`SELECT id FROM payouts WHERE room_id = ? AND rank = ?`)
    .get(params.id, body.rank) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE payouts SET tx_hash = ?, amount = ?, player_id = ?, confirmed_at = COALESCE(?, confirmed_at)
       WHERE id = ?`
    ).run(body.txHash, body.amount, body.playerId, confirmed, existing.id);
  } else {
    db.prepare(
      `INSERT INTO payouts (room_id, player_id, rank, amount, tx_hash, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(params.id, body.playerId, body.rank, body.amount, body.txHash, confirmed);
  }

  broadcast(params.id, {
    type: body.confirmed ? "payout_confirmed" : "payout_sent",
    rank: body.rank,
    playerId: body.playerId,
    amount: body.amount,
    txHash: body.txHash,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: Params) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rank, player_id AS playerId, amount, tx_hash AS txHash, confirmed_at AS confirmedAt
       FROM payouts WHERE room_id = ? ORDER BY rank ASC`
    )
    .all(params.id);
  return NextResponse.json({ payouts: rows });
}
