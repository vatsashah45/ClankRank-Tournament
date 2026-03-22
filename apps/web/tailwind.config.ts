import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        monad: "#836EF9",
        ethereum: "#627EEA",
        arbitrum: "#FF6B35",
        base: "#0052FF",
        navy: {
          950: "#010714",
          900: "#0d1b2a",
          800: "#162a44",
          700: "#1b3a5c",
          600: "#234d7a",
        },
        tier: {
          aaa: "#20808D",
          aa: "#115058",
          a: "#35D07F",
          baa: "#627EEA",
          ba: "#FFC553",
          b: "#FF6B35",
          caa: "#A84B2F",
          ca: "#944454",
          c: "#091717",
        },
      },
    },
  },
  plugins: [],
};
export default config;
