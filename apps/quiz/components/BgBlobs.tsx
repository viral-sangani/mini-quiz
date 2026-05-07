// Decorative background blobs — Welcome screen + onboarding only.

export function BgBlobs() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: -60, right: -40, width: 180, height: 180, background: "var(--sky)", opacity: 0.18, borderRadius: "50%" }} />
      <div style={{ position: "absolute", bottom: 80, left: -40, width: 140, height: 140, background: "var(--accent)", opacity: 0.18, borderRadius: "50%" }} />
      <div style={{ position: "absolute", top: 200, right: 30, width: 8, height: 8, background: "var(--berry)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", top: 250, right: 60, width: 6, height: 6, background: "var(--accent)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", top: 120, left: 30, width: 6, height: 6, background: "var(--primary)", borderRadius: "50%" }} />
    </div>
  );
}
