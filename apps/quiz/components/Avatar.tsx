import type { AvatarColor, AvatarEmoji } from "@mini-quiz/shared";

// Maps a stored avatarColor token to its CSS variable. Falls back to primary
// for unknown values so the UI never breaks if a row predates a token rename.
export function avatarColorVar(color: AvatarColor | string | null | undefined): string {
  if (!color) return "var(--primary)";
  const KNOWN: Record<string, string> = {
    primary: "var(--primary)",
    "primary-shade": "var(--primary-shade)",
    accent: "var(--accent)",
    "accent-shade": "var(--accent-shade)",
    berry: "var(--berry)",
    "berry-shade": "var(--berry-shade)",
    sky: "var(--sky)",
    "sky-shade": "var(--sky-shade)",
    sunshine: "var(--sunshine)",
    violet: "var(--violet)",
    "violet-shade": "var(--violet-shade)",
    gold: "var(--gold)",
  };
  return KNOWN[color] ?? "var(--primary)";
}

export function Avatar({
  emoji,
  color,
  // Falls back to a single-letter when we don't have an emoji yet (pre-onboarding).
  fallback,
  size = 48,
  ring,
}: {
  emoji?: AvatarEmoji | string | null;
  color?: AvatarColor | string | null;
  fallback?: string;
  size?: number;
  ring?: string | null;
}) {
  const bg = avatarColorVar(color);
  return (
    <span
      className="mq-avatar"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.5,
        boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      }}
    >
      <span style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.15))" }}>
        {emoji ?? (fallback ?? "🙂")}
      </span>
    </span>
  );
}
