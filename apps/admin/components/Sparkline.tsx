// Tiny SVG line chart matching design's `.adm-spark`. Decorative only; no axes.

export function Sparkline({
  values,
  color = "var(--a-primary)",
  width = 80,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = 2;
  const denom = values.length - 1 || 1;
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / denom) * (width - pad * 2);
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="adm-spark" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
