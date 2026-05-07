"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminStats } from "@mini-quiz/shared";
import { adminApi } from "@/lib/admin-api";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import { AdminAvatar, initialsOf } from "./AdminAvatar";

type NavItem = {
  id: string;
  href: string;
  icon: AdminIconName;
  label: string;
  // Route prefix that activates this item. Less specific than `match`.
  matchPrefix?: string;
  // Exact route patterns (with [id] placeholder) that take priority over any
  // sibling's matchPrefix. Used by "Live now" so it wins over "Games" when
  // we're on /quizzes/[id]/live.
  matchExact?: RegExp[];
  count?: number;
};

export function Sidebar({
  user,
  onSignOut,
}: {
  user: { email: string | null; name?: string | null };
  onSignOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await adminApi.get<AdminStats>("/admin/stats");
        if (!cancelled) setStats(data);
      } catch {
        // sidebar counts are best-effort
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const liveCount = stats?.liveQuiz ? 1 : 0;
  const gamesCount = stats?.todaysGames.length;
  const failedCount = stats?.attention.failedPayouts.count ?? 0;

  const operate: NavItem[] = [
    { id: "overview", href: "/overview", icon: "home", label: "Overview" },
    {
      id: "games",
      href: "/quizzes",
      icon: "play",
      label: "Games",
      matchPrefix: "/quizzes",
      count: gamesCount,
    },
    {
      id: "live",
      href: stats?.liveQuiz
        ? `/quizzes/${stats.liveQuiz.quizId}/live`
        : "/quizzes",
      icon: "flag",
      label: "Live now",
      // Any /quizzes/<id>/live URL claims this item — wins over the Games prefix.
      matchExact: [/^\/quizzes\/[^/]+\/live$/],
      count: liveCount,
    },
  ];
  const moneyAndPeople: NavItem[] = [
    { id: "players", href: "/players", icon: "people", label: "Players" },
    {
      id: "payouts",
      href: "/payouts",
      icon: "cash",
      label: "Payouts",
      matchPrefix: "/payouts",
      count: failedCount > 0 ? failedCount : undefined,
    },
    { id: "admins", href: "/admins", icon: "people", label: "Admins" },
  ];
  const account: NavItem[] = [
    { id: "settings", href: "/settings", icon: "cog", label: "Settings" },
  ];

  // Resolve a single active item per render. Specificity order:
  //   1. matchExact regex hit
  //   2. matchPrefix on the longest (most specific) prefix
  //   3. exact href
  // Items checked: only one wins; the rest render inactive.
  const allItems = [...operate, ...moneyAndPeople, ...account];
  const exactWinner = allItems.find((it) =>
    it.matchExact?.some((re) => re.test(pathname)),
  );
  const prefixWinner = exactWinner
    ? null
    : allItems
        .filter((it) => it.matchPrefix && pathname.startsWith(it.matchPrefix))
        .sort((a, b) => (b.matchPrefix?.length ?? 0) - (a.matchPrefix?.length ?? 0))[0];
  const hrefWinner =
    exactWinner || prefixWinner
      ? null
      : allItems.find((it) => it.href === pathname);
  const activeId = (exactWinner ?? prefixWinner ?? hrefWinner)?.id ?? null;

  const isActive = (item: NavItem) => item.id === activeId;

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="adm-nav-grp">{children}</div>
  );

  const Item = ({ item }: { item: NavItem }) => (
    <Link href={item.href} className={isActive(item) ? "active" : ""}>
      <AdminIcon
        name={item.icon}
        size={16}
        color={isActive(item) ? "white" : "var(--a-ink-soft)"}
      />
      <span>{item.label}</span>
      {item.count != null && item.count > 0 && (
        <span className="adm-nav-counter">{item.count}</span>
      )}
    </Link>
  );

  return (
    <aside className="adm-side">
      <Link href="/overview" className="adm-logo no-underline text-ink">
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--a-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="11" r="7" fill="white" />
            <circle cx="9" cy="10" r="1.5" fill="var(--a-primary)" />
            <circle cx="15" cy="10" r="1.5" fill="var(--a-primary)" />
            <path
              d="M9 14q3 3 6 0"
              stroke="var(--a-primary)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <b>MiniQuiz</b>
        <span className="adm-logo-pill">ADMIN</span>
      </Link>

      <div className="adm-nav">
        <SectionHeader>Operate</SectionHeader>
        {operate.map((it) => (
          <Item key={it.label} item={it} />
        ))}
        <SectionHeader>People &amp; Money</SectionHeader>
        {moneyAndPeople.map((it) => (
          <Item key={it.label} item={it} />
        ))}
        <SectionHeader>Account</SectionHeader>
        {account.map((it) => (
          <Item key={it.label} item={it} />
        ))}
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 8,
          borderTop: "1px solid var(--a-line)",
          paddingTop: 12,
        }}
      >
        <AdminAvatar
          color="berry"
          initials={initialsOf(user.name ?? user.email ?? "Admin")}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.name ?? user.email ?? "Admin"}
          </div>
          <div style={{ fontSize: 10, color: "var(--a-ink-faint)", fontWeight: 600 }}>
            Operations admin
          </div>
        </div>
        {onSignOut}
      </div>
    </aside>
  );
}
