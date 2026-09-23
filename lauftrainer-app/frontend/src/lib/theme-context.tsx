"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "lt_theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Serverseitig noch unbekannt - das Inline-Script in layout.tsx setzt die
  // "dark"-Klasse vor dem ersten Paint, damit es keinen Flackerer gibt.
  // Dieser State synchronisiert sich beim Mount auf denselben Wert.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(getInitialTheme());
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyThemeClass(next);
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme muss innerhalb von <ThemeProvider> verwendet werden");
  }
  return ctx;
}
