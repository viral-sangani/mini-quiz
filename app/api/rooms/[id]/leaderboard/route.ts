import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return NextResponse.json({ rows: getLeaderboard(params.id) });
}
