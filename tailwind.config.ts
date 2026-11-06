import type { Config } from "tailwindcss";

// Every color is a CSS variable (see app/globals.css) so the app follows light and dark mode.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: v("bg"), // page background
        abyss: v("bg-subtle"), // inputs, inset rows
        surface: v("surface"), // cards
        line: v("border"),
        ink: v("fg"),
        muted: v("fg-muted"),
        // Neutral accent (icons, active tabs)
        cyber: { DEFAULT: v("fg-2"), 400: v("fg-2"), 500: v("fg-2") },
        // Status colors, used sparingly
        emerald: { DEFAULT: v("ok"), 400: v("ok"), 500: v("ok"), 600: v("ok") },
        amber: { DEFAULT: v("warn"), 400: v("warn"), 500: v("warn") },
        flame: { DEFAULT: v("bad"), 400: v("bad"), 500: v("bad") },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Geist", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        rise: { "0%": { opacity: "0.001", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "none" } },
        scan: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(250%)" } },
      },
      animation: {
        rise: "rise .25s ease-out both",
        scan: "scan 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
