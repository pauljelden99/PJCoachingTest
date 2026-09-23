/**
 * Tempobereiche fuer Schwellenintervalle unterschiedlicher Dauer nach
 * Marius Bakkens "Golden Zone"-Ansatz (mariusbakken.com/vdot.html):
 * kuerzere Wiederholungen laufen nahe an der Schwellenpace, laengere
 * zunehmend langsamer, um die Gesamtbelastung ueber die Intervalldauer
 * vergleichbar zu halten. Rein clientseitiges Anzeige-Feature, analog zu
 * lib/danielsZones.ts/lib/paceZones.ts - kein Bezug zur GA1/Schwelle/
 * VO2max-Klassifizierung (services/zone_classifier.py). Die Bandbreiten
 * dienen sowohl der Info-Tabelle im Profil (computeBakkenZones) als auch
 * der Tempo-Ableitung fuer zeitbasierte Schwellen-Intervalle im
 * Trainingsplan-Editor (paceForIntervalDuration, siehe
 * lib/paceZones.ts:deriveZonePace).
 */

import { formatPaceValue } from "@/lib/pace";

export interface BakkenZoneRow {
  duration: string;
  pace: string;
}

interface BakkenZoneInput {
  threshold_pace_sec_per_km: number | null;
}

// [Dauer-Label, untere %-Grenze langsamer als Schwelle, obere %-Grenze]
const DURATION_BANDS: { duration: string; pctSlowerMin: number; pctSlowerMax: number }[] = [
  { duration: "45s – 1min", pctSlowerMin: 0, pctSlowerMax: 0 },
  { duration: "1 – 3min", pctSlowerMin: 0.01, pctSlowerMax: 0.03 },
  { duration: "4 – 5min", pctSlowerMin: 0.03, pctSlowerMax: 0.06 },
  { duration: "8 – 12min", pctSlowerMin: 0.06, pctSlowerMax: 0.09 },
];

export function computeBakkenZones(user: BakkenZoneInput): BakkenZoneRow[] | null {
  const threshold = user.threshold_pace_sec_per_km;
  if (!threshold) return null;

  return DURATION_BANDS.map(({ duration, pctSlowerMin, pctSlowerMax }) => {
    if (pctSlowerMin === 0 && pctSlowerMax === 0) {
      return { duration, pace: `~${formatPaceValue(threshold)}/km` };
    }
    const fast = threshold * (1 + pctSlowerMin);
    const slow = threshold * (1 + pctSlowerMax);
    return { duration, pace: `${formatPaceValue(fast)} – ${formatPaceValue(slow)}/km` };
  });
}

// Stuetzpunkte (Intervalldauer in Sekunden -> %-langsamer-als-Schwelle) am
// Mittelpunkt jeder Dauer-Kategorie oben, fuer eine stetige Interpolation
// zwischen den Bakken-Bandbreiten (statt eines Sprungs an den
// Bandgrenzen). Ausserhalb von 45s-12min wird auf den jeweils
// naechstliegenden Stuetzpunkt begrenzt (geclamped).
const DURATION_PCT_POINTS: { durationS: number; pctSlower: number }[] = [
  { durationS: 52.5, pctSlower: 0 }, // Mitte 45s-1min
  { durationS: 120, pctSlower: 0.02 }, // Mitte 1-3min
  { durationS: 270, pctSlower: 0.045 }, // Mitte 4-5min
  { durationS: 600, pctSlower: 0.075 }, // Mitte 8-12min
];

/**
 * Konkrete Pace (Sekunden/km) fuer ein zeitbasiertes Schwellen-Intervall
 * gegebener Dauer - Grundlage fuer die automatische Pace-Ableitung von
 * Schwelle-Segmenten im Trainingsplan-Editor (siehe
 * lib/paceZones.ts:deriveZonePace), damit dort nicht nur die flache
 * Schwellenpace, sondern die nach Bakken gestaffelte Pace uebernommen
 * wird.
 */
export function paceForIntervalDuration(durationS: number, thresholdPaceSecPerKm: number): number {
  const points = DURATION_PCT_POINTS;
  if (durationS <= points[0].durationS) return thresholdPaceSecPerKm * (1 + points[0].pctSlower);
  const last = points[points.length - 1];
  if (durationS >= last.durationS) return thresholdPaceSecPerKm * (1 + last.pctSlower);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (durationS >= a.durationS && durationS <= b.durationS) {
      const t = (durationS - a.durationS) / (b.durationS - a.durationS);
      const pctSlower = a.pctSlower + t * (b.pctSlower - a.pctSlower);
      return thresholdPaceSecPerKm * (1 + pctSlower);
    }
  }
  return thresholdPaceSecPerKm;
}
