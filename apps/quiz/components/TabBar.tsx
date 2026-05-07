"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

// Bottom tab bar visible inside the (onboarded) route group. Active state is
// derived from `usePathname()` so it stays in sync without a router subscribe.

const TABS: { href: string; icon: IconName; label: string; match: (p: string) => boolean }[] = [
  { href: "/", icon: "home", label: "Play", match: (p) => p === "/" },
  {
    href: "/daily",
    icon: "clock",
    label: "Daily",
    match: (p) => p.startsWith("/daily"),
  },
  {
    href: "/practice",
    icon: "list",
    label: "Practice",
    match: (p) => p.startsWith("/practice"),
  },
  {
    href: "/leaderboard",
    icon: "trophy",
    label: "Ranks",
    match: (p) => p.startsWith("/leaderboard"),
  },
  {
    href: "/profile",
    icon: "profile",
    label: "Me",
    match: (p) => p.startsWith("/profile"),
  },
];

export function TabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <div className="mq-tabbar">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="mq-tab"
            aria-current={active ? "page" : undefined}
          >
            <Icon
              name={t.icon}
              size={22}
              color={active ? "var(--primary)" : "var(--ink-faint)"}
            />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
