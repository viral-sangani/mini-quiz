"use client";

import { useState } from "react";
import { Mango } from "./Mango";
import { MQButton } from "./MQButton";

const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.opera.minipay";
const IOS_URL =
  "https://apps.apple.com/de/app/minipay-easy-global-wallet/id6504087257";

export function MiniPayGate({ targetUrl }: { targetUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // noop
    }
  }

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
      <div
        className="mq-card"
        style={{ width: "100%", maxWidth: 440, padding: 24 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <Mango pose="wave" size={120} />
          <h1 className="mq-h1" style={{ fontSize: 28 }}>Open in MiniPay</h1>
          <p className="mq-body" style={{ fontSize: 15 }}>
            You need the MiniPay wallet to play and win USDT prizes.
          </p>
        </div>

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <a href={ANDROID_URL} target="_blank" rel="noreferrer">
            <MQButton block size="lg" variant="primary">Get MiniPay on Android</MQButton>
          </a>
          <a href={IOS_URL} target="_blank" rel="noreferrer">
            <MQButton block size="lg" variant="sky">Get MiniPay on iOS</MQButton>
          </a>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="mq-eyebrow" style={{ marginBottom: 6 }}>Link to open in MiniPay</div>
          <code
            style={{
              display: "block",
              width: "100%",
              overflowX: "auto",
              borderRadius: 12,
              border: "2px solid var(--line)",
              background: "var(--bg)",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              color: "var(--ink)",
            }}
          >
            {targetUrl}
          </code>
          <MQButton
            block
            size="md"
            variant="ghost"
            onClick={copy}
            style={{ marginTop: 8, fontSize: 13 }}
          >
            {copied ? "Copied!" : "Copy link"}
          </MQButton>
        </div>
      </div>
    </main>
  );
}
