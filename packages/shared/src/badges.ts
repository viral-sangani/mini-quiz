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
  | "first_usdt";

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
    label: "First USDT",
    description: "Received your first prize on-chain",
  },
] as const;

export const BADGE_BY_ID: Record<BadgeId, BadgeDef> = Object.fromEntries(
  BADGE_CATALOG.map((b) => [b.id, b]),
) as Record<BadgeId, BadgeDef>;
