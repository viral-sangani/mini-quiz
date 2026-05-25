export type CapacityQuizStatus = "SCHEDULED" | "LIVE" | "ENDED";

export type CapacityQuizCandidate = {
  id: string;
  title: string;
  status: CapacityQuizStatus;
  scheduledStart: Date | null;
  endedAt: Date | null;
  prizeAmounts: string[];
};

export type CapacityMode = "idle" | "warm";

export type CapacityDecision = {
  mode: CapacityMode;
  reasons: string[];
};

export type CapacityLagState =
  | { status: "ok"; pending: number; ackPending: number }
  | { status: "unavailable"; reason: string };

export type CapacityPolicyOptions = {
  warmLeadMs?: number;
  cooldownMs?: number;
};

const DEFAULT_WARM_LEAD_MS = 10 * 60_000;
const DEFAULT_COOLDOWN_MS = 10 * 60_000;

export function decideCapacityMode(
  quizzes: CapacityQuizCandidate[],
  now = new Date(),
  options: CapacityPolicyOptions = {},
): CapacityDecision {
  const warmLeadMs = options.warmLeadMs ?? DEFAULT_WARM_LEAD_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const nowMs = now.getTime();
  const reasons: string[] = [];

  for (const quiz of quizzes) {
    if (!hasPrizePool(quiz.prizeAmounts)) continue;

    if (quiz.status === "LIVE") {
      reasons.push(`${quiz.title} is live`);
      continue;
    }

    if (quiz.status === "SCHEDULED" && quiz.scheduledStart) {
      const startMs = quiz.scheduledStart.getTime();
      if (startMs >= nowMs && startMs - nowMs <= warmLeadMs) {
        reasons.push(`${quiz.title} starts within warm window`);
        continue;
      }
      if (startMs < nowMs && nowMs - startMs <= cooldownMs) {
        reasons.push(`${quiz.title} is waiting for quorum inside cooldown`);
      }
      continue;
    }

    if (quiz.status === "ENDED" && quiz.endedAt) {
      const endedMs = quiz.endedAt.getTime();
      if (endedMs <= nowMs && nowMs - endedMs <= cooldownMs) {
        reasons.push(`${quiz.title} ended inside cooldown`);
      }
    }
  }

  return {
    mode: reasons.length > 0 ? "warm" : "idle",
    reasons,
  };
}

export function guardIdleDownscale(
  decision: CapacityDecision,
  currentlyWarm: boolean,
  lag: CapacityLagState,
): CapacityDecision {
  if (decision.mode === "warm" || !currentlyWarm) return decision;
  if (lag.status === "unavailable") {
    return {
      mode: "warm",
      reasons: [`NATS lag check failed: ${lag.reason}`],
    };
  }
  if (lag.pending > 0 || lag.ackPending > 0) {
    return {
      mode: "warm",
      reasons: [
        `score worker lag pending=${lag.pending} ackPending=${lag.ackPending}`,
      ],
    };
  }
  return decision;
}

function hasPrizePool(prizeAmounts: string[]): boolean {
  return prizeAmounts.some((amount) => Number(amount || 0) > 0);
}
