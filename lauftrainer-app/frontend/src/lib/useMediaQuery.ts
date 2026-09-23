"use client";

import { useCallback, useSyncExternalStore } from "react";

// Breakpoint, ab dem die Desktop-Layouts greifen - identisch zu Tailwinds
// "md" (siehe tailwind.config.ts / die md:-Klassen in components/Navbar.tsx),
// damit CSS-basierte und JS-basierte Umschaltung exakt beim selben Punkt
// kippen und nicht kurzzeitig zwei verschiedene Layouts mischen.
export const MOBILE_MAX_WIDTH_PX = 767;

// Zusaetzlich zu "md" (siehe oben) der Umschaltpunkt fuer Ansichten, die
// erst ab Laptop-Breite genug Platz fuer ihre volle Spaltenzahl haben -
// identisch zu Tailwinds "lg".
export const TABLET_MAX_WIDTH_PX = 1023;

/**
 * Reagiert auf eine CSS-Media-Query - fuer die Faelle, in denen ein reines
 * Umschalten per CSS (hidden/md:block) nicht reicht, weil beide Varianten
 * sonst gleichzeitig im DOM haengen wuerden: bei Formularen (doppelter
 * lokaler State, doppelte Eingabefelder mit denselben Namen) und bei
 * teuren Listen waere das weder korrekt noch guenstig. Wo nur Abstaende/
 * Spaltenzahlen variieren, bleiben stattdessen Tailwind-Breakpoints die
 * erste Wahl.
 *
 * Serverseitig (und beim ersten Client-Render vor der Hydration) wird
 * bewusst `false` geliefert: der Server kennt die Viewport-Breite nicht,
 * und ein abweichender erster Client-Render wuerde einen
 * Hydration-Mismatch ausloesen. Direkt nach der Hydration korrigiert
 * useSyncExternalStore den Wert.
 */
export function useMediaQuery(query: string): boolean {
  // useCallback, damit useSyncExternalStore nicht bei jedem Render neu
  // abonniert - die Funktionsidentitaet ist dort das Abo-Kriterium.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
}

/** True unterhalb der Laptop-Breite, also auf Smartphone UND Tablet. */
export function useIsBelowDesktop(): boolean {
  return useMediaQuery(`(max-width: ${TABLET_MAX_WIDTH_PX}px)`);
}

/**
 * Chart-Hoehe je Geraet: auf dem Smartphone flacher, da ein 260-280px
 * hoher Graph dort zusammen mit Kartenrand, Ueberschrift und Legende fast
 * den gesamten Bildschirm fuellt und beim Scrollen nie mehr als ein Chart
 * gleichzeitig sichtbar waere. Nach unten auf 180px begrenzt - darunter
 * verlieren die Y-Achsen-Beschriftungen ihren Abstand.
 */
export function useChartHeight(desktopHeight: number): number {
  return useIsMobile() ? Math.max(180, Math.round(desktopHeight * 0.8)) : desktopHeight;
}
