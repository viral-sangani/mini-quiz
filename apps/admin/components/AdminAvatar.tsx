// Initials-over-color disc, matches design's `.adm-avatar`. If avatarEmoji is
// provided we render the emoji instead (the player app stores curated emojis
// + design-token colors on User).

const AVATAR_COLORS: Record<string, string> = {
  primary: "var(--a-primary)",
  berry: "var(--a-berry)",
  sky: "var(--a-sky)",
  accent: "var(--a-accent)",
  "berry-shade": "#C2375E",
  "sky-shade": "#1574B0",
  "accent-shade": "#D88412",
  violet: "#9B5CF6",
  gold: "var(--a-gold)",
  ink: "var(--a-ink)",
};

export function AdminAvatar({
  emoji,
  color,
  initials,
  size = 28,
}: {
  emoji?: string | null;
  color?: string | null;
  initials?: string;
  size?: number;
}) {
  const bg = AVATAR_COLORS[color ?? "primary"] ?? "var(--a-primary)";
  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <span
      className="adm-avatar"
      style={{ width: size, height: size, fontSize, background: bg }}
    >
      {emoji ? <span style={{ fontSize: size * 0.6 }}>{emoji}</span> : initials}
    </span>
  );
}

// Helper: pull initials from a name. Returns up to 2 chars uppercase.
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || "??").toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[1]![0] ?? "")).toUpperCase();
}
