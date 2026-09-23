import type { Config } from "tailwindcss";

// Farbwahl bewusst an Trainings-Intensitaet gekoppelt, nicht dekorativ:
// moss (kuehl) = Fitness/Ruhe, clay (warm) = Fatigue/Belastung - siehe
// Verwendung in TrainingLoadChart.tsx. paper/surface sind die beiden
// Hintergrundebenen (Seite vs. Karte), ink/mist die Textebenen - die
// konkreten Farbwerte kommen aus CSS-Variablen (siehe globals.css), die
// je nach hellem/dunklem Theme (Klasse "dark" auf <html>, gesteuert von
// lib/theme-context.tsx) unterschiedlich definiert sind. Das
// `rgb(var(...) / <alpha-value>)`-Muster erhaelt dabei Tailwinds
// Opacity-Modifier-Syntax (z.B. `border-mist/30`).
function themeColor(cssVar: string): string {
  return `rgb(var(${cssVar}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: themeColor("--color-ink"),
        paper: themeColor("--color-paper"),
        surface: themeColor("--color-surface"),
        moss: themeColor("--color-moss"),
        clay: themeColor("--color-clay"),
        mist: themeColor("--color-mist"),
        danger: themeColor("--color-danger"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
