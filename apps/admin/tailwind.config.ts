import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Nunito", "system-ui", "sans-serif"],
      },
      colors: {
        bg: "var(--a-bg)",
        surface: "var(--a-surface)",
        ink: "var(--a-ink)",
        "ink-soft": "var(--a-ink-soft)",
        "ink-faint": "var(--a-ink-faint)",
        line: "var(--a-line)",
        "line-soft": "var(--a-line-soft)",
        primary: "var(--a-primary)",
        "primary-tint": "var(--a-primary-tint)",
        accent: "var(--a-accent)",
        "accent-tint": "var(--a-accent-tint)",
        berry: "var(--a-berry)",
        "berry-tint": "var(--a-berry-tint)",
        sky: "var(--a-sky)",
        "sky-tint": "var(--a-sky-tint)",
        wrong: "var(--a-wrong)",
        "wrong-tint": "var(--a-wrong-tint)",
        gold: "var(--a-gold)",
      },
    },
  },
  plugins: [],
};

export default config;
