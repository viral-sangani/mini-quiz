import type { Config } from "tailwindcss";

// Tropical palette from the Claude Design bundle (`/tmp/miniquiz-design`).
// Tokens are exposed both as CSS variables (in globals.css) and as Tailwind
// colors so we can use either `text-mq-primary` or `text-[var(--primary)]`.
// Light-mode only for v1 — no dark/berry/sunshine alt palettes.

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mq: {
          bg: "var(--bg)",
          ink: "var(--ink)",
          "ink-soft": "var(--ink-soft)",
          "ink-faint": "var(--ink-faint)",
          line: "var(--line)",
          card: "var(--card)",
          primary: "var(--primary)",
          "primary-shade": "var(--primary-shade)",
          accent: "var(--accent)",
          "accent-shade": "var(--accent-shade)",
          berry: "var(--berry)",
          "berry-shade": "var(--berry-shade)",
          sky: "var(--sky)",
          "sky-shade": "var(--sky-shade)",
          sunshine: "var(--sunshine)",
          violet: "var(--violet)",
          "violet-shade": "var(--violet-shade)",
          gold: "var(--gold)",
          wrong: "var(--wrong)",
          "wrong-shade": "var(--wrong-shade)",
        },
      },
      fontFamily: {
        display: ["var(--font-nunito)", "system-ui", "sans-serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        pill: "var(--r-pill)",
        card: "var(--r-card)",
        button: "var(--r-button)",
        tile: "var(--r-tile)",
      },
      keyframes: {
        bounceSoft: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        popIn: {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "60%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        mqPulse: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        mqBob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        mqTilt: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
      },
      animation: {
        "bounce-soft": "bounceSoft 2s ease-in-out infinite",
        "pop-in": "popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        wiggle: "wiggle 0.4s ease-in-out infinite",
        "mq-pulse": "mqPulse 1.2s ease-in-out infinite",
        "mq-bob": "mqBob 2.4s ease-in-out infinite",
        "mq-tilt": "mqTilt 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
