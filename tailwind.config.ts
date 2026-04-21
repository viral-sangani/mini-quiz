import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        duo: {
          green: "#58CC02",
          "green-dark": "#58A700",
          yellow: "#FFC800",
          "yellow-dark": "#E6B400",
          red: "#FF4B4B",
          "red-dark": "#EA2B2B",
          blue: "#1CB0F6",
          "blue-dark": "#1899D6",
          purple: "#CE82FF",
          orange: "#FF9600",
          gray: "#AFAFAF",
          "gray-light": "#E5E5E5",
          "gray-dark": "#777777",
          ink: "#3C3C3C",
          cream: "#FFFDF7",
        },
        celo: {
          yellow: "#FCFF52",
          green: "#476520",
          forest: "#355E3B",
        },
      },
      fontFamily: {
        display: ["var(--font-nunito)", "system-ui", "sans-serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "3d": "0 4px 0 0 rgb(0 0 0 / 0.18)",
        "3d-sm": "0 2px 0 0 rgb(0 0 0 / 0.18)",
        "3d-lg": "0 6px 0 0 rgb(0 0 0 / 0.22)",
        "3d-green": "0 4px 0 0 #58A700",
        "3d-yellow": "0 4px 0 0 #E6B400",
        "3d-red": "0 4px 0 0 #EA2B2B",
        "3d-blue": "0 4px 0 0 #1899D6",
        card: "0 2px 0 0 rgb(0 0 0 / 0.08), 0 1px 2px 0 rgb(0 0 0 / 0.04)",
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
      },
      animation: {
        "bounce-soft": "bounceSoft 2s ease-in-out infinite",
        "pop-in": "popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        wiggle: "wiggle 0.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
