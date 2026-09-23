/**
 * Herzfrequenzzonen nach der Karvonen-Methode (%HFR - Herzfrequenz-
 * reserve), identisch zur Klassifizierung in
 * backend/app/services/hr_zones.py:HrZones/ZONE_BOUNDS - hier client-
 * seitig gespiegelt, um im Profil konkrete bpm-Bereiche je Zone
 * anzuzeigen statt nur Ruhe-/Maximalpuls.
 */

export interface HrZoneRow {
  zone: string;
  range: string;
}

interface HrZoneInput {
  hr_rest: number | null;
  hr_max: number | null;
}

// Obere %HFR-Grenze je Zone - siehe hr_zones.py:ZONE_BOUNDS.
const ZONE_BOUNDS: { label: string; upper: number }[] = [
  { label: "Z1 Erholung", upper: 0.6 },
  { label: "Z2 Grundlage", upper: 0.7 },
  { label: "Z3 Entwicklung", upper: 0.8 },
  { label: "Z4 Schwelle", upper: 0.9 },
  { label: "Z5 Maximal", upper: Infinity },
];

export function computeHrZones(user: HrZoneInput): HrZoneRow[] | null {
  const hrRest = user.hr_rest;
  const hrMax = user.hr_max;
  if (!hrRest || !hrMax) return null;

  const reserve = hrMax - hrRest;
  let lowerFrac = 0;

  return ZONE_BOUNDS.map(({ label, upper }) => {
    const lowerBpm = Math.round(hrRest + lowerFrac * reserve);
    const upperBpm = upper === Infinity ? null : Math.round(hrRest + upper * reserve);
    lowerFrac = upper;
    return { zone: label, range: upperBpm === null ? `ab ${lowerBpm} bpm` : `${lowerBpm}–${upperBpm} bpm` };
  });
}
