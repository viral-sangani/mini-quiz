import { Icon, type IconName } from "./Icon";

export function StatChip({
  icon,
  value,
  color,
}: {
  icon: IconName;
  value: string | number;
  color?: string;
}) {
  return (
    <span
      className="mq-pill"
      style={{
        borderColor: color,
        color,
        padding: "6px 10px",
        fontSize: 13,
      }}
    >
      <Icon name={icon} size={14} color={color} />
      <span className="mq-num">{value}</span>
    </span>
  );
}
