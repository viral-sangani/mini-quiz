import { Icon, type IconName } from "./Icon";
import { MQCard } from "./MQCard";

export function StatTile({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  color: string;
}) {
  return (
    <MQCard style={{ padding: 12, textAlign: "center" }}>
      <Icon name={icon} size={20} color={color} />
      <div
        className="mq-num"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: 20,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          color: "var(--ink-soft)",
          letterSpacing: 0.1,
        }}
      >
        {label}
      </div>
    </MQCard>
  );
}
