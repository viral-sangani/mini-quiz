// Mango — the parrot mascot, in 6 poses. Ported from the Claude Design bundle
// at /tmp/miniquiz-design/miniquiz/project/mascot.jsx with the same SVG paths.
// Body colour pulls from the active palette via CSS vars so re-themes work.

import type { CSSProperties } from "react";

export type MangoPose = "wave" | "cheer" | "think" | "sad" | "sleep" | "peek";

export function Mango({
  pose = "wave",
  size = 140,
  className,
  style,
}: {
  pose?: MangoPose;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Pose = POSES[pose] ?? Wave;
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-block",
        ...style,
      }}
    >
      <Pose />
    </div>
  );
}

// Shared parrot palette. Body uses the live design tokens so the mascot
// retints with palette changes; the rest are fixed brand colours.
const P = {
  body: "var(--primary, #4CD050)",
  bodyDark: "var(--primary-shade, #2FA833)",
  belly: "#FFE08A",
  bellyDark: "#E0B017",
  beak: "#FF9F1C",
  beakDark: "#D87C00",
  cheek: "#FF5C8A",
  eye: "#1F2A44",
  feet: "#FF8A2A",
};

function Wave() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <ellipse cx="80" cy="186" rx="12" ry="5" fill={P.feet} />
      <ellipse cx="115" cy="186" rx="12" ry="5" fill={P.feet} />
      <path d="M155 130 Q188 145 178 168 Q170 175 158 168 Z" fill={P.bodyDark} />
      <path d="M155 130 Q185 140 175 160 Q165 165 155 158 Z" fill={P.body} />
      <ellipse cx="100" cy="130" rx="56" ry="55" fill={P.body} />
      <ellipse cx="100" cy="130" rx="56" ry="55" fill="none" stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="142" rx="32" ry="34" fill={P.belly} />
      <g transform="translate(50,110) rotate(-25)">
        <ellipse cx="0" cy="0" rx="22" ry="14" fill={P.bodyDark} />
        <ellipse cx="2" cy="-2" rx="18" ry="10" fill={P.body} />
      </g>
      <circle cx="100" cy="78" r="44" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <path d="M88 38 Q92 22 100 32 Q108 22 112 38 Q104 30 100 40 Q96 30 88 38Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="86" rx="32" ry="26" fill={P.belly} />
      <circle cx="78" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="122" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="86" cy="78" r="6" fill="white" />
      <circle cx="114" cy="78" r="6" fill="white" />
      <circle cx="87" cy="79" r="3.5" fill={P.eye} />
      <circle cx="115" cy="79" r="3.5" fill={P.eye} />
      <circle cx="88" cy="78" r="1" fill="white" />
      <circle cx="116" cy="78" r="1" fill="white" />
      <path d="M92 96 Q100 116 108 96 Q108 106 100 108 Q92 106 92 96Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" strokeLinejoin="round" />
      <path d="M94 100 Q100 108 106 100" fill={P.beakDark} opacity="0.4" />
    </svg>
  );
}

function Cheer() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <ellipse cx="80" cy="186" rx="12" ry="5" fill={P.feet} />
      <ellipse cx="115" cy="186" rx="12" ry="5" fill={P.feet} />
      <path d="M152 130 Q185 138 178 165 Q170 172 156 165 Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="130" rx="56" ry="55" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="142" rx="32" ry="34" fill={P.belly} />
      <g transform="translate(50,100) rotate(-55)">
        <ellipse cx="0" cy="0" rx="22" ry="13" fill={P.bodyDark} />
        <ellipse cx="2" cy="-2" rx="18" ry="9" fill={P.body} />
      </g>
      <g transform="translate(150,100) rotate(55)">
        <ellipse cx="0" cy="0" rx="22" ry="13" fill={P.bodyDark} />
        <ellipse cx="-2" cy="-2" rx="18" ry="9" fill={P.body} />
      </g>
      <circle cx="100" cy="78" r="44" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <path d="M88 38 Q92 22 100 32 Q108 22 112 38 Q104 30 100 40 Q96 30 88 38Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="86" rx="32" ry="26" fill={P.belly} />
      <circle cx="78" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="122" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <path d="M82 78 Q86 72 92 78" stroke={P.eye} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M108 78 Q114 72 118 78" stroke={P.eye} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M88 96 Q100 122 112 96 Q108 110 100 112 Q92 110 88 96Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="100" cy="106" rx="6" ry="4" fill={P.beakDark} opacity="0.5" />
    </svg>
  );
}

function Think() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <ellipse cx="80" cy="186" rx="12" ry="5" fill={P.feet} />
      <ellipse cx="115" cy="186" rx="12" ry="5" fill={P.feet} />
      <path d="M155 130 Q185 140 175 160 Q165 165 155 158 Z" fill={P.body} />
      <ellipse cx="100" cy="130" rx="56" ry="55" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="142" rx="32" ry="34" fill={P.belly} />
      <g transform="translate(78,96) rotate(-15)">
        <ellipse cx="0" cy="0" rx="20" ry="12" fill={P.bodyDark} />
        <ellipse cx="2" cy="-2" rx="16" ry="8" fill={P.body} />
      </g>
      <circle cx="100" cy="78" r="44" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <path d="M88 38 Q92 22 100 32 Q108 22 112 38 Q104 30 100 40 Q96 30 88 38Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="86" rx="32" ry="26" fill={P.belly} />
      <circle cx="78" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="122" cy="92" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="86" cy="78" r="6" fill="white" />
      <circle cx="114" cy="78" r="6" fill="white" />
      <circle cx="89" cy="76" r="3.5" fill={P.eye} />
      <circle cx="117" cy="76" r="3.5" fill={P.eye} />
      <path d="M88 96 Q100 110 112 96 Q106 102 100 102 Q94 102 88 96Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="155" cy="40" r="14" fill="white" stroke={P.eye} strokeWidth="2.5" />
      <circle cx="138" cy="58" r="5" fill="white" stroke={P.eye} strokeWidth="2" />
      <circle cx="132" cy="68" r="3" fill="white" stroke={P.eye} strokeWidth="1.5" />
      <text x="155" y="46" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="16" fill={P.eye}>?</text>
    </svg>
  );
}

function Sad() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <ellipse cx="80" cy="186" rx="12" ry="5" fill={P.feet} />
      <ellipse cx="115" cy="186" rx="12" ry="5" fill={P.feet} />
      <path d="M155 130 Q180 145 168 168 Q160 170 152 162 Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="135" rx="55" ry="50" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="146" rx="30" ry="32" fill={P.belly} />
      <g transform="translate(52,140) rotate(15)"><ellipse cx="0" cy="0" rx="18" ry="11" fill={P.bodyDark} /><ellipse cx="2" cy="-2" rx="14" ry="7" fill={P.body} /></g>
      <g transform="translate(148,140) rotate(-15)"><ellipse cx="0" cy="0" rx="18" ry="11" fill={P.bodyDark} /><ellipse cx="-2" cy="-2" rx="14" ry="7" fill={P.body} /></g>
      <circle cx="100" cy="80" r="44" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <path d="M88 40 Q92 24 100 34 Q108 24 112 40 Q104 32 100 42 Q96 32 88 40Z" fill={P.bodyDark} />
      <ellipse cx="100" cy="88" rx="32" ry="26" fill={P.belly} />
      <circle cx="78" cy="94" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="122" cy="94" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="86" cy="82" r="6" fill="white" />
      <circle cx="114" cy="82" r="6" fill="white" />
      <circle cx="86" cy="84" r="3.5" fill={P.eye} />
      <circle cx="114" cy="84" r="3.5" fill={P.eye} />
      <path d="M80 76 Q86 72 92 76" stroke={P.eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M108 76 Q114 72 120 76" stroke={P.eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M82 92 Q80 100 84 102 Q88 100 86 92Z" fill="#7DD3FC" />
      <path d="M92 100 Q100 92 108 100 Q108 110 100 110 Q92 110 92 100Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Sleep() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <ellipse cx="100" cy="186" rx="40" ry="6" fill="rgba(0,0,0,0.1)" />
      <ellipse cx="100" cy="135" rx="62" ry="40" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="146" rx="36" ry="22" fill={P.belly} />
      <ellipse cx="100" cy="100" rx="40" ry="32" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="106" rx="30" ry="20" fill={P.belly} />
      <circle cx="80" cy="108" r="5" fill={P.cheek} opacity="0.6" />
      <circle cx="120" cy="108" r="5" fill={P.cheek} opacity="0.6" />
      <path d="M82 96 Q88 100 94 96" stroke={P.eye} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M106 96 Q112 100 118 96" stroke={P.eye} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M93 116 Q100 124 107 116 Q104 120 100 120 Q96 120 93 116Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" />
      <text x="150" y="60" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="22" fill={P.eye}>z</text>
      <text x="170" y="42" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="16" fill={P.eye} opacity="0.7">z</text>
    </svg>
  );
}

function Peek() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible" }}>
      <circle cx="100" cy="100" r="60" fill={P.body} stroke={P.bodyDark} strokeWidth="3" />
      <ellipse cx="100" cy="110" rx="40" ry="32" fill={P.belly} />
      <circle cx="80" cy="112" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="120" cy="112" r="6" fill={P.cheek} opacity="0.6" />
      <circle cx="86" cy="96" r="7" fill="white" />
      <circle cx="114" cy="96" r="7" fill="white" />
      <circle cx="87" cy="97" r="4" fill={P.eye} />
      <circle cx="115" cy="97" r="4" fill={P.eye} />
      <circle cx="88" cy="96" r="1.2" fill="white" />
      <circle cx="116" cy="96" r="1.2" fill="white" />
      <path d="M90 116 Q100 134 110 116 Q108 124 100 126 Q92 124 90 116Z" fill={P.beak} stroke={P.beakDark} strokeWidth="2" />
    </svg>
  );
}

const POSES: Record<MangoPose, () => JSX.Element> = {
  wave: Wave,
  cheer: Cheer,
  think: Think,
  sad: Sad,
  sleep: Sleep,
  peek: Peek,
};
