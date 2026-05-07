import type { CSSProperties, ReactNode } from "react";

export function Pill({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span className={`mq-pill ${className ?? ""}`} style={style}>
      {children}
    </span>
  );
}
