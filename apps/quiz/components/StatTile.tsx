import { Icon, type IconName } from "./Icon";

// Profile stats. Icon chip top-left + big value + small label below. The
// `color` prop drives both the chip background and the bottom accent stripe
// via the `--tile-accent` CSS variable consumed by `.mq-stat-tile` rules.
export function StatTile({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: IconName;
  color: string;
}) {
  return (
    <div
      className="mq-stat-tile"
      style={{ ["--tile-accent" as string]: color }}
    >
      <span className="mq-stat-tile__chip" aria-hidden="true">
        <Icon name={icon} size={18} color="white" />
      </span>
      <div className="mq-stat-tile__value">{value}</div>
      {subtext && <div className="mq-stat-tile__subtext">{subtext}</div>}
      <div className="mq-stat-tile__label">{label}</div>
    </div>
  );
}
