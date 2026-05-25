"use client";

import { Mango } from "./Mango";
import { MQButton } from "./MQButton";
import { MQCard } from "./MQCard";

export function ProfileErrorScreen({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <main
      className="mq-screen"
      style={{
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <MQCard style={{ width: "100%", maxWidth: 430, padding: 24, textAlign: "center" }}>
        <Mango pose="think" size={112} />
        <h1 className="mq-h2" style={{ marginTop: 8 }}>
          MiniPay connected
        </h1>
        <p className="mq-body" style={{ fontSize: 14, marginTop: 6 }}>
          Mini Quiz could not reach the game server.
        </p>
        {message && (
          <p
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "2px solid var(--line)",
              background: "var(--bg)",
              color: "var(--ink-soft)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {message}
          </p>
        )}
        <MQButton
          block
          size="lg"
          variant="primary"
          onClick={onRetry}
          style={{ marginTop: 16 }}
        >
          Retry
        </MQButton>
      </MQCard>
    </main>
  );
}
