export function formatPaceValue(secPerKm: number): string {
  const rounded = Math.round(secPerKm);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// Kehrfunktion zu formatPaceValue: "mm:ss" (z.B. "4:30") -> Sekunden/km.
// null bei leerem/ungueltigem Wert - genutzt, um aus Distanz + Tempo die
// Gesamtzeit einer Aktivitaet abzuleiten (siehe lib/plan.ts:segmentsTotalDurationS).
export function parsePaceValue(pace: string): number | null {
  const match = pace.trim().match(/^(\d+):([0-5]?\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
