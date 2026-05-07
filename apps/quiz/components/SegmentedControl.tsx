"use client";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--card)",
        border: "2px solid var(--line)",
        borderRadius: 12,
        padding: 4,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 12,
              borderRadius: 8,
              border: 0,
              background: active ? "var(--primary)" : "transparent",
              color: active ? "white" : "var(--ink-soft)",
              boxShadow: active ? "inset 0 -2px 0 0 rgba(0,0,0,0.15)" : "none",
              letterSpacing: 0.04,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
