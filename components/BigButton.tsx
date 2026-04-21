"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "green" | "yellow" | "red" | "blue" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

const BASE =
  "btn-3d relative inline-flex items-center justify-center select-none rounded-2xl font-extrabold uppercase tracking-wide text-center whitespace-normal break-words leading-tight disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 text-white";

const VARIANTS: Record<Variant, string> = {
  green: "bg-duo-green shadow-3d-green hover:bg-[#63d905]",
  yellow: "bg-duo-yellow text-duo-ink shadow-3d-yellow hover:bg-[#FFD025]",
  red: "bg-duo-red shadow-3d-red hover:bg-[#FF6464]",
  blue: "bg-duo-blue shadow-3d-blue hover:bg-[#2CBBF7]",
  ghost: "bg-white text-duo-ink border-2 border-duo-gray-light shadow-3d-sm hover:bg-duo-cream",
};

const SIZES: Record<Size, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-base",
  lg: "h-14 px-8 text-lg",
  xl: "h-16 px-10 text-xl",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const BigButton = forwardRef<HTMLButtonElement, Props>(function BigButton(
  { variant = "green", size = "lg", className = "", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});
