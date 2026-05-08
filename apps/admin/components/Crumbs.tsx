import Link from "next/link";
import type { ReactNode } from "react";

// Breadcrumb chain for the admin in-page header. Pass items in
// document order; the last entry is the current page (no link).
//
//   <Crumbs items={[
//     { label: "Home", href: "/overview" },
//     { label: "Practice", href: "/practice" },
//     { label: "Football" },
//   ]} />
//
// Renders inside the same `.adm-crumbs` slot we already use for sub-titles.

export type CrumbItem = {
  label: ReactNode;
  href?: string;
};

export function Crumbs({ items }: { items: CrumbItem[] }) {
  return (
    <div
      className="adm-crumbs"
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}
    >
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const node = it.href && !isLast ? (
          <Link
            href={it.href}
            style={{
              color: "var(--a-ink-soft)",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {it.label}
          </Link>
        ) : (
          <span
            style={{
              color: isLast ? "var(--a-ink)" : "var(--a-ink-soft)",
              fontWeight: isLast ? 800 : 700,
            }}
          >
            {it.label}
          </span>
        );
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {node}
            {!isLast && (
              <span aria-hidden="true" style={{ color: "var(--a-ink-faint)" }}>
                ›
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
