// Badge catalog — single source of truth for both backend (award logic) and
// frontend (badge grid rendering). Adding a new badge here is enough to make
// it appear in the locked-grid; backend awarding is wired up in badge.service.ts.

export type BadgeId =
  | "first_quiz"
  | "first_win"
  | "top_3"
  | "perfect_10"
  | "speedy"
  | "ten_quizzes"
  | "fifty_quizzes"
  | "first_usdt"
  | "daily_first_play"
  | "daily_first_win"
  | "daily_perfect"
  | "streak_3"
  | "streak_7"
  | "streak_30"
  | "practice_explorer"
  | "practice_scholar";

export type BadgeDef = {
  id: BadgeId;
  // Icon name from components/Icon.tsx (matches the design's icon set).
  icon: string;
  // CSS variable token (without the --) used for the badge's solid colour.
  color: string;
  label: string;
  description: string;
};

export const BADGE_CATALOG: readonly BadgeDef[] = [
  {
    id: "first_quiz",
    icon: "play",
    color: "sky",
    label: "First quiz",
    description: "Played your first quiz",
  },
  {
    id: "first_win",
    icon: "trophy",
    color: "gold",
    label: "First win",
    description: "Finished top-3 for the first time",
  },
  {
    id: "top_3",
    icon: "medal",
    color: "berry",
    label: "Podium",
    description: "Finished in the top 3",
  },
  {
    id: "perfect_10",
    icon: "star",
    color: "primary",
    label: "Perfect 10",
    description: "Answered every question correctly",
  },
  {
    id: "speedy",
    icon: "lightning",
    color: "accent",
    label: "Speedy",
    description: "Average answer under 3 seconds (≥80% correct)",
  },
  {
    id: "ten_quizzes",
    icon: "flame",
    color: "accent-shade",
    label: "Regular",
    description: "Played 10 quizzes",
  },
  {
    id: "fifty_quizzes",
    icon: "crown",
    color: "violet",
    label: "Veteran",
    description: "Played 50 quizzes",
  },
  {
    id: "first_usdt",
    icon: "gem",
    color: "sky-shade",
    label: "First prize",
    description: "Received your first prize on-chain",
  },
  {
    id: "daily_first_play",
    icon: "calendar",
    color: "sky",
    label: "Daily debut",
    description: "Played your first daily quiz",
  },
  {
    id: "daily_first_win",
    icon: "trophy",
    color: "gold",
    label: "Daily champ",
    description: "Topped the daily leaderboard",
  },
  {
    id: "daily_perfect",
    icon: "star",
    color: "primary",
    label: "Daily perfect",
    description: "10/10 on a daily quiz",
  },
  {
    id: "streak_3",
    icon: "flame",
    color: "accent",
    label: "3-day streak",
    description: "Played the daily quiz 3 days in a row",
  },
  {
    id: "streak_7",
    icon: "flame",
    color: "berry",
    label: "7-day streak",
    description: "Played the daily quiz 7 days in a row",
  },
  {
    id: "streak_30",
    icon: "crown",
    color: "violet",
    label: "30-day streak",
    description: "Played the daily quiz 30 days in a row",
  },
  {
    id: "practice_explorer",
    icon: "compass",
    color: "sky-shade",
    label: "Explorer",
    description: "Tried 5 different practice topics",
  },
  {
    id: "practice_scholar",
    icon: "book",
    color: "accent-shade",
    label: "Scholar",
    description: "Completed 50 practice quizzes",
  },
] as const;

export const BADGE_BY_ID: Record<BadgeId, BadgeDef> = Object.fromEntries(
  BADGE_CATALOG.map((b) => [b.id, b]),
) as Record<BadgeId, BadgeDef>;
