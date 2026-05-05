import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        b3: {
          ink: "#0a0a0a",
          fog: "#1a1a1f",
          bone: "#f5f1e9",
          rust: "#d2691e",
          mint: "#00ff9c",
          alarm: "#ff3860",
        },
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
