import { NextResponse } from "next/server";
import { createRoom } from "@/lib/db";
import { isHostAddress } from "@/lib/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DURATION_MS = 3 * 60 * 1000;
const DEFAULT_QUESTION_TIME_MS = 15_000;
const DEFAULT_PRIZES = ["50", "25", "15", "5", "5", "5", "5", "5", "5", "5"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    durationMs?: number;
    questionTimeMs?: number;
    prizeAmounts?: string[];
    hostAddress?: string;
  };

  const headerAddress = req.headers.get("x-host-address");
  const caller = body.hostAddress ?? headerAddress ?? null;
  if (!isHostAddress(caller)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const room = await createRoom({
    durationMs: body.durationMs ?? DEFAULT_DURATION_MS,
    questionTimeMs: body.questionTimeMs ?? DEFAULT_QUESTION_TIME_MS,
    prizeAmounts: body.prizeAmounts ?? DEFAULT_PRIZES,
  });

  return NextResponse.json({ roomId: room.id });
}
