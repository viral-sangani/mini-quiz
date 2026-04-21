import { NextResponse } from "next/server";
import { payoutsForRoom, upsertPayout } from "@/lib/db";
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

  const now = Date.now();
  await upsertPayout({
    roomId: params.id,
    playerId: body.playerId,
    rank: body.rank,
    amount: body.amount,
    txHash: body.txHash,
    confirmedAt: body.confirmed ? now : null,
  });

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
  const payouts = (await payoutsForRoom(params.id)).map((p) => ({
    rank: p.rank,
    playerId: p.playerId,
    amount: p.amount,
    txHash: p.txHash,
    confirmedAt: p.confirmedAt,
  }));
  return NextResponse.json({ payouts });
}
