"use client";

import Link from "next/link";
import { BgBlobs } from "@/components/BgBlobs";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";

export default function OnboardingWelcomePage() {
  return (
    <>
      <BgBlobs />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Mango pose="wave" size={200} style={{ marginBottom: 16 }} />
        <h1 className="mq-h1" style={{ fontSize: 32, marginBottom: 8 }}>
          Hi, I&apos;m Mango!
        </h1>
        <p className="mq-body" style={{ fontSize: 16, maxWidth: 280, marginBottom: 32 }}>
          Quick quizzes. Real prizes. Three minutes a day.
        </p>
      </div>
      <div style={{ padding: "0 20px 28px" }}>
        <Link href="/onboarding/avatar">
          <MQButton block size="lg">Let&apos;s go</MQButton>
        </Link>
      </div>
    </>
  );
}
