"use client";

import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";

// Design's `mq-btn` system. A variant maps to the (--btn-bg, --btn-shade) pair
// the CSS reads via custom-properties. `ghost` uses `mq-btn--ghost` instead.
//
// Press feel: framer-motion drives a `whileTap` scale + spring transition so
// the release pops back with a tiny overshoot (instead of just snapping
// back). Falls back to the static button when prefers-reduced-motion is on.

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

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: MQButtonVariant;
  size?: "md" | "lg";
  block?: boolean;
};

// motion.button accepts most HTML button props but its drag/animate props
// conflict with `onAnimationStart`/`onDrag*`. Cast the rest-spread to the
// motion type at the call site so consumers can keep using plain HTML
// button props.
type MotionButtonProps = React.ComponentProps<typeof motion.button>;

export const MQButton = forwardRef<HTMLButtonElement, Props>(function MQButton(
  { variant = "primary", size = "lg", block, className, style, type, disabled, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const classes = [
    "mq-btn",
    size === "lg" ? "mq-btn--lg" : "",
    block ? "mq-btn--block" : "",
    variant === "ghost" ? "mq-btn--ghost" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // When tapping, scale down and sink into the 3D shadow. The spring release
  // gives phone taps a subtle bounce without making navigation feel delayed.
  // Disabled buttons + reduced-motion users get the static rendering
  // (CSS :active still gives them a translateY hint).
  const tapAnim =
    disabled || reduced ? undefined : { scale: 0.93, y: 3 };
  const springTransition = {
    type: "spring" as const,
    stiffness: 520,
    damping: 18,
    mass: 0.45,
  };

  return (
    <motion.button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      disabled={disabled}
      whileTap={tapAnim}
      transition={springTransition}
      {...(rest as Omit<MotionButtonProps, "ref" | "className" | "style" | "type" | "disabled" | "whileTap" | "transition">)}
    />
  );
});
