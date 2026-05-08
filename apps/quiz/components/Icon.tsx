// Icon set ported from the Claude Design bundle's mascot.jsx. One small SVG
// per name; renders inline so colour can be inherited via `currentColor`.

export type IconName =
  | "flame"
  | "gem"
  | "heart"
  | "star"
  | "star-out"
  | "trophy"
  | "lightning"
  | "home"
  | "play"
  | "check"
  | "x"
  | "arrow-right"
  | "arrow-left"
  | "crown"
  | "medal"
  | "people"
  | "clock"
  | "lock"
  | "sparkle"
  | "wifi-off"
  | "list"
  | "profile"
  | "globe"
  | "chevron-right"
  | "plus"
  | "share"
  | "refresh"
  | "calendar"
  | "compass"
  | "book";

export function Icon({
  name,
  size = 20,
  color = "currentColor",
  strokeWidth = 2.5,
  className,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "flame":
      return (
        <svg {...props}>
          <path d="M12 22c-4 0-7-2.5-7-7 0-4 4-6 4-10 0 0 3 1 4 5 1-2 3-3 3-3 0 3 3 5 3 8 0 4-3 7-7 7z" fill={color} stroke="none" />
        </svg>
      );
    case "gem":
      return (
        <svg {...props}>
          <path d="M6 3h12l3 6-9 12L3 9z" />
          <path d="M3 9h18M12 3v18M9 9l3 12 3-12M9 9l3-6 3 6" />
        </svg>
      );
    case "heart":
      return (
        <svg {...props}>
          <path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 6.5-7 11-7 11z" fill={color} stroke="none" />
        </svg>
      );
    case "star":
      return (
        <svg {...props}>
          <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill={color} stroke="none" />
        </svg>
      );
    case "star-out":
      return (
        <svg {...props}>
          <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...props}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" fill={color} stroke={color} />
          <path d="M5 6H3a3 3 0 0 0 4 3M19 6h2a3 3 0 0 1-4 3M9 14h6v3l1 3H8l1-3v-3z" />
        </svg>
      );
    case "lightning":
      return (
        <svg {...props}>
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={color} stroke={color} />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />
        </svg>
      );
    case "play":
      return (
        <svg {...props}>
          <path d="M6 4l14 8-14 8z" fill={color} stroke="none" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M5 13l4 4L19 7" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...props}>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...props}>
          <path d="M19 12H5M11 5l-7 7 7 7" />
        </svg>
      );
    case "crown":
      return (
        <svg {...props}>
          <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill={color} stroke={color} />
        </svg>
      );
    case "medal":
      return (
        <svg {...props}>
          <circle cx="12" cy="14" r="6" fill={color} stroke={color} />
          <path d="M8 2l4 6 4-6" />
        </svg>
      );
    case "people":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-4 5-4s2 1 2 1" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" fill={color} stroke={color} />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...props}>
          <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={color} stroke="none" />
        </svg>
      );
    case "wifi-off":
      return (
        <svg {...props}>
          <path d="M3 3l18 18M9 17a3 3 0 0 1 6 0M5 13a8 8 0 0 1 4-2M19 13a8 8 0 0 0-3-2" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
    case "profile":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M3 21c0-5 4-7 9-7s9 2 9 7" />
        </svg>
      );
    case "globe":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...props}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "share":
      return (
        <svg {...props}>
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M9 11l6-3M9 13l6 3" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...props}>
          <path d="M21 4v6h-6M3 20v-6h6" />
          <path d="M20 9a8 8 0 0 0-14-3l-3 3M4 15a8 8 0 0 0 14 3l3-3" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
          <path d="M8 13h2v2H8zM14 13h2v2h-2zM8 17h2v2H8zM14 17h2v2h-2z" fill={color} stroke="none" />
        </svg>
      );
    case "compass":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" fill={color} stroke="none" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
          <path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
        </svg>
      );
  }
}
