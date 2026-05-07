"use client";

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";

// Design's `mq-btn` system. A variant maps to the (--btn-bg, --btn-shade) pair
// the CSS reads via custom-properties. `ghost` uses `mq-btn--ghost` instead.

export type MQButtonVariant =
  | "primary"
  | "accent"
  | "berry"
  | "sky"
  | "wrong"
  | "ghost";

const VARIANT_STYLE: Record<MQButtonVariant, CSSProperties> = {
  primary: {
    ["--btn-bg" as string]: "var(--primary)",
    ["--btn-shade" as string]: "var(--primary-shade)",
  },
  accent: {
    ["--btn-bg" as string]: "var(--accent)",
    ["--btn-shade" as string]: "var(--accent-shade)",
  },
  berry: {
    ["--btn-bg" as string]: "var(--berry)",
    ["--btn-shade" as string]: "var(--berry-shade)",
  },
  sky: {
    ["--btn-bg" as string]: "var(--sky)",
    ["--btn-shade" as string]: "var(--sky-shade)",
  },
  wrong: {
    ["--btn-bg" as string]: "var(--wrong)",
    ["--btn-shade" as string]: "var(--wrong-shade)",
  },
  ghost: {},
};

export const MQButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: MQButtonVariant;
    size?: "md" | "lg";
    block?: boolean;
  }
>(function MQButton(
  { variant = "primary", size = "lg", block, className, style, type, ...rest },
  ref,
) {
  const classes = [
    "mq-btn",
    size === "lg" ? "mq-btn--lg" : "",
    block ? "mq-btn--block" : "",
    variant === "ghost" ? "mq-btn--ghost" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...rest}
    />
  );
});
