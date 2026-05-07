// One KPI tile per design `.adm-kpi`. Delta optional, tone tints the delta
// line green/red for up/down.

export function KpiCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-l">{label}</div>
      <div className="adm-kpi-v">{value}</div>
      {delta !== undefined && (
        <div className={`adm-kpi-d${tone === "up" ? " up" : tone === "down" ? " down" : ""}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="adm-kpis">{children}</div>;
}
