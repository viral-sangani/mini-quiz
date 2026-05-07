const BASE_POINTS = 1000;
const MAX_SPEED_BONUS = 1000;

export function computePoints(params: {
  isCorrect: boolean;
  timeTakenMs: number;
  questionTimeMs: number;
}): number {
  if (!params.isCorrect) return 0;
  const ratio = Math.max(0, Math.min(1, 1 - params.timeTakenMs / params.questionTimeMs));
  const speedBonus = Math.floor(MAX_SPEED_BONUS * ratio);
  return BASE_POINTS + speedBonus;
}
