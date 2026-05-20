// Default lobby lead time. Individual live quizzes can override this with
// Quiz.lobbyOpenLeadMs; keep this export for older callers and defaults.
export const LOBBY_OPEN_LEAD_MS = 5 * 60 * 1000;

export function lobbyOpensAtIso(
  scheduledStartIso: string | null,
  lobbyOpenLeadMs = LOBBY_OPEN_LEAD_MS,
): string | null {
  if (!scheduledStartIso) return null;
  return new Date(
    new Date(scheduledStartIso).getTime() - lobbyOpenLeadMs,
  ).toISOString();
}

export function lobbyOpensAtDate(
  scheduledStart: Date | null,
  lobbyOpenLeadMs = LOBBY_OPEN_LEAD_MS,
): Date | null {
  if (!scheduledStart) return null;
  return new Date(scheduledStart.getTime() - lobbyOpenLeadMs);
}

export type LobbyPhase =
  | "no-schedule" // quiz has no scheduledStart (DRAFT)
  | "pre-lobby" // before lobby opens
  | "lobby-open" // joinable window
  | "starting" // (optional) at startAt; brief grace state
  | "live"
  | "ended";

export function lobbyPhase(params: {
  status: "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "ARCHIVED";
  scheduledStart: string | null;
  lobbyOpenLeadMs?: number;
  now?: number;
}): LobbyPhase {
  const now = params.now ?? Date.now();
  if (params.status === "LIVE") return "live";
  if (params.status === "ENDED" || params.status === "ARCHIVED") return "ended";
  if (!params.scheduledStart) return "no-schedule";
  const startMs = new Date(params.scheduledStart).getTime();
  const openMs = startMs - (params.lobbyOpenLeadMs ?? LOBBY_OPEN_LEAD_MS);
  if (now < openMs) return "pre-lobby";
  if (now < startMs) return "lobby-open";
  return "starting";
}

export function playersNeeded(playerCount: number, minParticipants: number): number {
  return Math.max(0, minParticipants - playerCount);
}
