// 28-icon SVG set ported verbatim from the Claude Design admin bundle. Use
// `name` to pick; defaults to currentColor. Single component keeps the bundle
// tree-shakeable per icon import — and matches the adm-* design language.

export type AdminIconName =
  | "home"
  | "play"
  | "list"
  | "plus"
  | "people"
  | "cash"
  | "bar"
  | "cog"
  | "search"
  | "bell"
  | "check"
  | "x"
  | "edit"
  | "eye"
  | "export"
  | "filter"
  | "arrow-right"
  | "arrow-left"
  | "chevron-r"
  | "clock"
  | "trophy"
  | "flag"
  | "more"
  | "alert"
  | "logout";

export function AdminIcon({
  name,
  size = 16,
  color = "currentColor",
  sw = 2,
}: {
  name: AdminIconName;
  size?: number;
  color?: string;
  sw?: number;
}) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...p}>
          <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />
        </svg>
      );
    case "play":
      return (
        <svg {...p}>
          <path d="M6 4l14 8-14 8z" fill={color} />
        </svg>
      );
    case "list":
      return (
        <svg {...p}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
    case "plus":
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "people":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-4 5-4" />
        </svg>
      );
    case "cash":
      return (
        <svg {...p}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "bar":
      return (
        <svg {...p}>
          <path d="M3 21h18M6 17V9M12 17V5M18 17v-6" />
        </svg>
      );
    case "cog":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2L3 14.8l2 3.5 2.5-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6c.1-.4.1-.8.1-1.2z" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-5-5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...p}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M5 13l4 4L19 7" />
        </svg>
      );
    case "x":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "edit":
      return (
        <svg {...p}>
          <path d="M14 4l6 6L8 22H2v-6z" />
        </svg>
      );
    case "eye":
      return (
        <svg {...p}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "export":
      return (
        <svg {...p}>
          <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
        </svg>
      );
    case "filter":
      return (
        <svg {...p}>
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...p}>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...p}>
          <path d="M19 12H5M11 5l-7 7 7 7" />
        </svg>
      );
    case "chevron-r":
      return (
        <svg {...p}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" fill={color} />
          <path d="M5 6H3a3 3 0 0 0 4 3M19 6h2a3 3 0 0 1-4 3M9 14h6v3l1 3H8l1-3v-3z" />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
        </svg>
      );
    case "more":
      return (
        <svg {...p}>
          <circle cx="12" cy="6" r="1.5" fill={color} />
          <circle cx="12" cy="12" r="1.5" fill={color} />
          <circle cx="12" cy="18" r="1.5" fill={color} />
        </svg>
      );
    case "alert":
      return (
        <svg {...p}>
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v5M12 18v.01" />
        </svg>
      );
    case "logout":
      return (
        <svg {...p}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}
