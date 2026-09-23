/**
 * Wattzonen-Grenzen (GA1/Schwelle/VO2max) fuer Radeinheiten, identisch zur
 * Klassifizierung in backend/app/services/watt_zones.py:WattZones - hier
 * clientseitig gespiegelt fuer die Watt-Ableitung im Trainingsplan-Editor
 * (siehe SegmentEditor.tsx), analog zu lib/paceZones.ts fuer Laufen.
 *
 * Anders als bei Pace (kleinerer Wert = intensiver) ist bei Watt ein
 * GROESSERER Wert intensiver - die Richtung ist hier bewusst umgekehrt zu
 * paceZones.ts, siehe classifyWattZone/deriveZoneWatts.
 */

import type { PlanSegment, SegmentType } from "@/types/training";

// Muss mit backend/app/services/watt_zones.py uebereinstimmen.
const GA1_UPPER_FTP_PCT = 0.75;
const VO2MAX_LOWER_FTP_PCT = 1.05;

export interface WattZoneInput {
  ftp_watts?: number | null;
  // Vom Trainer im Athletenprofil hinterlegte Watt-Vorgaben fuer Auf-/
  // Abwaermen (siehe AthleteProfileForm.tsx) - haben Vorrang vor der
  // generischen GA1-basierten Schaetzung in deriveZoneWatts, analog zu
  // warmup_pace_sec_per_km/cooldown_pace_sec_per_km beim Laufen (siehe
  // paceZones.ts).
  warmup_watts?: number | null;
  cooldown_watts?: number | null;
}

function ga1UpperBound(ftpWatts: number): number {
  return ftpWatts * GA1_UPPER_FTP_PCT;
}

function vo2maxLowerBound(ftpWatts: number): number {
  return ftpWatts * VO2MAX_LOWER_FTP_PCT;
}

export function ga1UpperWatts(input: WattZoneInput): number | null {
  return input.ftp_watts != null ? Math.round(ga1UpperBound(input.ftp_watts)) : null;
}

export function vo2maxLowerWatts(input: WattZoneInput): number | null {
  return input.ftp_watts != null ? Math.round(vo2maxLowerBound(input.ftp_watts)) : null;
}

// Klassifiziert eine tatsaechlich getretene Watt-Leistung fuers
// Protokollieren (Pendant zu paceZones.ts:classifyPaceZone) - liefert
// null ohne hinterlegte FTP.
export function classifyWattZone(watts: number, input: WattZoneInput): "GA1" | "Schwelle" | "VO2max" | null {
  if (input.ftp_watts == null) return null;
  if (watts < ga1UpperBound(input.ftp_watts)) return "GA1";
  if (watts >= vo2maxLowerBound(input.ftp_watts)) return "VO2max";
  return "Schwelle";
}

// Schwellenintervalle werden - anders als eine flache Dauerfahrt bei FTP -
// mit zunehmender Intervalllaenge nicht mehr voll bei 100% FTP durchgehalten:
// 3min (die "klassische" Schwellenintervall-Laenge) entspricht der vollen
// FTP, 10min faellt linear auf 85% FTP ab. Ausserhalb dieser Spanne wird
// der jeweilige Randwert beibehalten (kuerzer als 3min bzw. laenger als
// 10min), statt linear unbegrenzt weiter zu extrapolieren.
const THRESHOLD_MIN_DURATION_S = 180; // 3min -> 100% FTP
const THRESHOLD_MAX_DURATION_S = 600; // 10min -> 85% FTP
const THRESHOLD_MAX_DURATION_PCT = 0.85;

function thresholdPctForDuration(durationS: number): number {
  if (durationS <= THRESHOLD_MIN_DURATION_S) return 1;
  if (durationS >= THRESHOLD_MAX_DURATION_S) return THRESHOLD_MAX_DURATION_PCT;
  const t = (durationS - THRESHOLD_MIN_DURATION_S) / (THRESHOLD_MAX_DURATION_S - THRESHOLD_MIN_DURATION_S);
  return 1 - t * (1 - THRESHOLD_MAX_DURATION_PCT);
}

export interface WattZoneContext {
  // Segmentdauer in Sekunden - beeinflusst nur den Schwelle-Vorschlag
  // (siehe thresholdPctForDuration), da Rad-Segmente immer dauerbasiert
  // sind (siehe SegmentEditor.tsx:unitOptionsForType).
  duration_s?: number | null;
  // Segmenttyp - Auf-/Abwaermen nutzen bei gesetzter Trainer-Vorgabe
  // (WattZoneInput.warmup_watts/cooldown_watts) einen festen Wert statt
  // der generischen GA1-Schaetzung (siehe unten).
  type?: SegmentType;
}

// Leitet einen Watt-Vorschlag fuer ein Plan-Segment aus der gewaehlten
// Zone (und bei Schwelle-Intervallen zusaetzlich der Dauer) ab. GA1/VO2max
// bleiben ein einfacher Punktwert je Zone (keine Dauer-Staffelung noetig),
// Schwelle folgt der linearen FTP-Staffelung oben. Auf-/Abwaermen (Zone
// "GA1", siehe lib/plan.ts:defaultSegments) nutzen bevorzugt eine explizite
// Trainer-Vorgabe (warmup_watts/cooldown_watts) statt der generischen
// GA1-Schaetzung, analog zu deriveZonePace beim Laufen.
export function deriveZoneWatts(zone: string, input: WattZoneInput, context: WattZoneContext = {}): number | null {
  if (input.ftp_watts == null) return null;
  if (context.type === "warmup" && input.warmup_watts != null) return Math.round(input.warmup_watts);
  if (context.type === "cooldown" && input.cooldown_watts != null) return Math.round(input.cooldown_watts);
  if (zone === "GA1") return Math.round(ga1UpperBound(input.ftp_watts) * 0.9);
  if (zone === "Schwelle") {
    const pct = context.duration_s ? thresholdPctForDuration(context.duration_s) : 1;
    return Math.round(input.ftp_watts * pct);
  }
  if (zone === "VO2max") return Math.round(vo2maxLowerBound(input.ftp_watts) * 1.1);
  return null;
}

// Fuellt die Watt-Felder aller Segmente ohne manuell eingegebenen Wert
// anhand ihrer Zone (und Dauer) auf ("Auto-Vorschlag, ueberschreibbar") -
// Pendant zu paceZones.ts:applyDerivedPaces fuer Rad-Segmente.
export function applyDerivedWatts(segments: PlanSegment[], zones: WattZoneInput | null): PlanSegment[] {
  if (!zones) return segments;
  return segments.map((s) => {
    if (s.watts != null || !s.zone) return s;
    const derived = deriveZoneWatts(s.zone, zones, { duration_s: s.duration_s, type: s.type });
    return derived != null ? { ...s, watts: derived } : s;
  });
}

// --- Fuenf-Zonen-Anzeige (Profil, WattZoneTable.tsx) ------------------------
//
// Fuer die Trainingsplanung/Segment-Klassifizierung reichen (wie beim
// Laufen) drei Stufen (GA1/Schwelle/VO2max, siehe oben) - die Profilseite
// soll die Rad-Wattzonen aber feiner aufgeloest als gaengige 5-Zonen-Tabelle
// zeigen (vereinfachtes Coggan-Modell, ohne die anaeroben/neuromuskulaeren
// Spitzenzonen 6-7, die ohnehin nicht ueber eine reine FTP-Prozent-Grenze
// sinnvoll definierbar sind). Rein informativ - beeinflusst keine
// Segment-Klassifizierung oben.
export interface FiveZoneRow {
  zone: string;
  lowerPct: number; // untere %FTP-Grenze dieser Zone (0 fuer die unterste)
  upperPct: number | null; // obere %FTP-Grenze, null = keine Obergrenze (oberste Zone)
  lowerWatts: number;
  upperWatts: number | null;
}

const FIVE_ZONE_UPPER_PCT: { zone: string; upperPct: number | null }[] = [
  { zone: "Erholung", upperPct: 0.55 },
  { zone: "Grundlage", upperPct: 0.75 },
  { zone: "Tempo", upperPct: 0.9 },
  { zone: "Schwelle", upperPct: 1.05 },
  { zone: "VO2max", upperPct: null },
];

export function computeFiveWattZones(input: WattZoneInput): FiveZoneRow[] | null {
  if (input.ftp_watts == null) return null;
  const ftp = input.ftp_watts;
  let lowerWatts = 0;
  let lowerPct = 0;
  return FIVE_ZONE_UPPER_PCT.map(({ zone, upperPct }) => {
    const upperWatts = upperPct != null ? Math.round(ftp * upperPct) : null;
    const row: FiveZoneRow = { zone, lowerPct, upperPct, lowerWatts, upperWatts };
    lowerWatts = (upperWatts ?? lowerWatts) + 1;
    lowerPct = upperPct ?? lowerPct;
    return row;
  });
}
