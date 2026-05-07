"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  type AvatarColor,
  type AvatarEmoji,
} from "@mini-quiz/shared";
import { Avatar, avatarColorVar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Mango } from "@/components/Mango";
import { MQButton } from "@/components/MQButton";
import { readDraft, writeDraft } from "@/lib/onboarding-draft";

export default function OnboardingAvatarPage() {
  const [emoji, setEmoji] = useState<AvatarEmoji>(AVATAR_EMOJIS[0]);
  const [color, setColor] = useState<AvatarColor>(AVATAR_COLORS[0]);

  useEffect(() => {
    const d = readDraft();
    if (d.avatarEmoji) setEmoji(d.avatarEmoji);
    if (d.avatarColor) setColor(d.avatarColor);
  }, []);

  return (
    <>
      <Header />

      <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, justifyContent: "center" }}>
        <div style={{ width: 36, height: 6, borderRadius: 3, background: "var(--primary)" }} />
        <div style={{ width: 36, height: 6, borderRadius: 3, background: "var(--line)" }} />
      </div>

      <div style={{ padding: "0 16px 8px", textAlign: "center" }}>
        <Mango pose="peek" size={120} style={{ marginBottom: 4 }} />
        <h1 className="mq-h2" style={{ marginBottom: 4 }}>Choose your look</h1>
        <p className="mq-body" style={{ fontSize: 14 }}>You can change it later</p>
      </div>

      {/* Live preview */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <Avatar emoji={emoji} color={color} size={88} ring="white" />
      </div>

      {/* Color row */}
      <div style={{ padding: "0 24px 12px" }}>
        <div className="mq-eyebrow" style={{ marginBottom: 6 }}>Background</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 8 }}>
          {AVATAR_COLORS.map((c) => {
            const selected = c === color;
            return (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  border: selected ? "3px solid var(--ink)" : "2px solid var(--line)",
                  borderRadius: 999,
                  background: avatarColorVar(c),
                  padding: 0,
                  cursor: "pointer",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Emoji grid */}
      <div style={{ padding: "0 24px 12px", flex: 1, overflowY: "auto" }}>
        <div className="mq-eyebrow" style={{ marginBottom: 6 }}>Avatar</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {AVATAR_EMOJIS.map((e) => {
            const selected = e === emoji;
            return (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                style={{
                  position: "relative",
                  background: "var(--card)",
                  border: selected ? "3px solid var(--primary)" : "2px solid var(--line)",
                  borderRadius: 16,
                  padding: 8,
                  fontSize: 36,
                  cursor: "pointer",
                  boxShadow: selected ? "0 4px 0 0 var(--primary-shade)" : "0 2px 0 0 var(--line)",
                }}
              >
                {e}
                {selected && (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid var(--bg)",
                    }}
                  >
                    <Icon name="check" size={12} color="white" strokeWidth={4} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "12px 20px 24px" }}>
        <Link
          href="/onboarding/username"
          onClick={() => writeDraft({ avatarEmoji: emoji, avatarColor: color })}
        >
          <MQButton block size="lg">
            Continue <Icon name="arrow-right" size={18} color="white" />
          </MQButton>
        </Link>
      </div>
    </>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
      }}
    >
      <Link
        href="/onboarding"
        aria-label="Back"
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: "var(--card)",
          border: "2px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 0 0 var(--line)",
        }}
      >
        <Icon name="arrow-left" size={18} color="var(--ink)" />
      </Link>
      <div className="mq-h3" style={{ flex: 1, textAlign: "center" }}>
        Pick a look
      </div>
      <div style={{ width: 36 }} />
    </div>
  );
}
