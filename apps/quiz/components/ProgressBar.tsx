export function ProgressBar({
  pct,
  color,
  height = 14,
}: {
  pct: number;
  color?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="mq-progress" style={{ height }}>
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color ?? "var(--primary)",
        }}
      />
    </div>
  );
}
