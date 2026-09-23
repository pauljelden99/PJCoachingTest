import type { Theme } from "@/lib/theme-context";

// Recharts-Props (stroke/fill/contentStyle) brauchen konkrete Farbwerte,
// keine Tailwind-Klassen oder CSS-Variablen - daher ein paralleles
// Hex-Farbset pro Theme, inhaltlich abgestimmt auf die CSS-Variablen in
// globals.css.
export interface ChartColors {
  grid: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  moss: string;
  clay: string;
  mist: string;
  danger: string;
  blue: string;
  amber: string;
  violet: string;
  teal: string;
  sky: string;
  rose: string;
}

const LIGHT: ChartColors = {
  grid: "#dbe0dc",
  tick: "#6b7570",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dbe0dc",
  tooltipText: "#1f2723",
  moss: "#2f6fa6",
  clay: "#c1651b",
  mist: "#6b7570",
  danger: "#c53030",
  blue: "#3f7fa6",
  amber: "#c99a2e",
  violet: "#7a5cb0",
  teal: "#2e8f7a",
  sky: "#2f9bc9",
  rose: "#b0507c",
};

const DARK: ChartColors = {
  grid: "#2a323c",
  tick: "#8a9098",
  tooltipBg: "#1a2028",
  tooltipBorder: "#2a323c",
  tooltipText: "#eceff2",
  moss: "#4c94e0",
  clay: "#e08a4c",
  mist: "#8a9098",
  danger: "#e5484d",
  blue: "#5b9bd5",
  amber: "#e0b23e",
  violet: "#a78bda",
  teal: "#4bb6a0",
  sky: "#5cc0ea",
  rose: "#d97bab",
};

export function getChartColors(theme: Theme): ChartColors {
  return theme === "dark" ? DARK : LIGHT;
}

export function tooltipStyle(colors: ChartColors) {
  return {
    contentStyle: {
      background: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: 8,
    },
    labelStyle: { color: colors.tooltipText },
    itemStyle: { color: colors.tooltipText },
  };
}

// Recharts' Standard-Tooltip-Cursor ist ein helles Grau (#ccc, 30% Deckkraft)
// bzw. beim Line-activeDot ein weisser Ring - im Dark Theme wirkt das wie ein
// ploetzliches weisses Aufleuchten beim Hovern. Hier durch themafarbene,
// dezente Varianten ersetzt.
export function barCursorStyle(colors: ChartColors) {
  return { fill: colors.mist, fillOpacity: 0.12 };
}

export function lineCursorStyle(colors: ChartColors) {
  return { stroke: colors.mist, strokeWidth: 1, strokeDasharray: "3 3" };
}

export function activeDotStyle(colors: ChartColors, stroke: string) {
  return { r: 4, strokeWidth: 2, stroke: colors.tooltipBg, fill: stroke };
}

// Rundet Achsenbeschriftungen auf ganze Zahlen.
export function roundTick(value: number): string {
  return Math.round(value).toString();
}
