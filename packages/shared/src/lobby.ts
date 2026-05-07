// How long before scheduledStart the lobby opens (i.e. when "Join" is enabled).
// Players may join in the [scheduledStart - LOBBY_OPEN_LEAD_MS, scheduledStart) window only.
// Both backend and frontend import this so they agree on the rule.
export const LOBBY_OPEN_LEAD_MS = 5 * 60 * 1000;

export function lobbyOpensAtIso(scheduledStartIso: string | null): string | null {
  if (!scheduledStartIso) return null;
  return new Date(
    new Date(scheduledStartIso).getTime() - LOBBY_OPEN_LEAD_MS,
  ).toISOString();
}

export function lobbyOpensAtDate(scheduledStart: Date | null): Date | null {
  if (!scheduledStart) return null;
  return new Date(scheduledStart.getTime() - LOBBY_OPEN_LEAD_MS);
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
  now?: number;
}): LobbyPhase {
  const now = params.now ?? Date.now();
  if (params.status === "LIVE") return "live";
  if (params.status === "ENDED" || params.status === "ARCHIVED") return "ended";
  if (!params.scheduledStart) return "no-schedule";
  const startMs = new Date(params.scheduledStart).getTime();
  const openMs = startMs - LOBBY_OPEN_LEAD_MS;
  if (now < openMs) return "pre-lobby";
  if (now < startMs) return "lobby-open";
  return "starting";
}
