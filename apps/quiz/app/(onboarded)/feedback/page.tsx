"use client";

import Link from "next/link";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { MQCard } from "@/components/MQCard";

const FEEDBACK_FORM_URL = "https://forms.gle/BTXVLBrs8wtyqZLt7";

export default function FeedbackPage() {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px 28px",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/profile"
          className="mq-body"
          style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-soft)" }}
        >
          ← Back to profile
        </Link>
      </div>

      <div style={{ textAlign: "center", padding: "8px 8px 20px" }}>
        <Mango pose="think" size={132} style={{ margin: "0 auto 12px" }} />
        <h1 className="mq-h1" style={{ fontSize: 30, marginBottom: 8 }}>
          Feedback &amp; support
        </h1>
        <p
          className="mq-body"
          style={{
            color: "var(--ink-soft)",
            lineHeight: 1.5,
            maxWidth: 320,
            margin: "0 auto",
          }}
        >
          Tell us what happened, report a payout issue, or share ideas to make
          Mini Quiz better.
        </p>
      </div>

      <MQCard style={{ padding: 18, display: "grid", gap: 14 }}>
        <div>
          <h2 className="mq-h2" style={{ fontSize: 18, marginBottom: 6 }}>
            What to include
          </h2>
          <ul
            className="mq-body"
            style={{
              color: "var(--ink-soft)",
              lineHeight: 1.55,
              paddingLeft: 18,
              margin: 0,
              display: "grid",
              gap: 6,
            }}
          >
            <li>Your MiniPay wallet address if the issue involves rewards.</li>
            <li>The quiz room code or game name, if you have it.</li>
            <li>A screenshot or screen recording for bugs.</li>
          </ul>
        </div>

        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          <MQButton block size="lg" variant="primary">
            Open feedback form
          </MQButton>
        </a>
      </MQCard>
    </div>
  );
}
