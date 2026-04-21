import { subscribe, type RoomEvent } from "@/lib/events";
import { getRoom } from "@/lib/db";
import { getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const room = getRoom(params.id);
  if (!room) return new Response("Room not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send = (event: RoomEvent) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      safeEnqueue(`: connected\n\n`);
      send({ type: "leaderboard", rows: getLeaderboard(params.id) });

      const unsub = subscribe(params.id, { send });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, 15_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
