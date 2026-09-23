/**
 * Tempozonen-Grenzen (GA1/Schwelle/VO2max), identisch zur Klassifizierung
 * in backend/app/services/zone_classifier.py:PaceZones - hier client-
 * seitig gespiegelt fuer die Tempo-Ableitung im Trainingsplan-Editor
 * (siehe deriveZonePace/applyDerivedPaces) - dieselben Grenzen, nach
 * denen z.B. die Dashboard-Zeit-in-Zone-Auswertung und die Plan-Zielzone
 * klassifiziert werden.
 */

import { formatPaceValue, parsePaceValue } from "@/lib/pace";
import { computeDanielsZones, type DanielsInput, type DanielsManualPaces } from "@/lib/danielsZones";
import { paceForIntervalDuration } from "@/lib/bakkenZones";
import { segmentsVisibleForZone } from "@/lib/plan";
import type { PlanSegment, SegmentType } from "@/types/training";

export interface PaceZoneInput {
  threshold_pace_sec_per_km: number | null;
  vo2max_pace_sec_per_km: number | null;
  // Manuelle Ueberschreibung der Easy-Zone (siehe DanielsManualPaces) -
  // fliesst in die GA1-Pace-Ableitung unten mit ein, damit ein manuell in
  // der Trainingsbereichtabelle gesetzter Easy-Wert auch hier statt des
  // berechneten VDOT-Werts verwendet wird. Marathon/Repetition beeinflussen
  // keine Segment-Ableitung und werden hier bewusst nicht gebraucht.
  easy_pace_sec_per_km?: number | null;
  // Vom Trainer im Athletenprofil hinterlegte Pace-Vorgaben fuer Auf-/
  // Abwaermen (siehe AthleteProfileForm.tsx) - haben Vorrang vor der
  // generischen Easy+Offset-Schaetzung in deriveZonePace, analog zu
  // warmup_watts/cooldown_watts beim Radfahren (siehe wattZones.ts).
  warmup_pace_sec_per_km?: number | null;
  cooldown_pace_sec_per_km?: number | null;
}

// Eingabe fuer die Segment-Tempo-Ableitung (deriveZonePace/applyDerivedPaces):
// Schwelle/VO2max kommen direkt aus den Pace-Zonen-Grenzen, GA1 aus der
// Jack-Daniels-Tabelle (siehe deriveZonePace) - daher beide Eingabe-Formen.
export interface SegmentZoneInput extends PaceZoneInput, DanielsInput {}

// Kontext eines Segments, der die abgeleitete Pace beeinflusst, ohne
// selbst Teil der Zonengrenzen zu sein: der Segmenttyp (Cooldown laeuft
// spuerbar lockerer als ein normaler GA1-Dauerlauf) sowie Dauer/Distanz
// bei Intervallen (Grundlage der Bakken-Staffelung fuer Schwelle-
// Segmente, siehe deriveZonePace).
export interface SegmentPaceContext {
  type?: SegmentType;
  duration_s?: number | null;
  // Fuer km-basierte Schwellen-Intervalle ohne duration_s: die Dauer wird
  // ueber distance_km * Schwellenpace geschaetzt, um trotzdem die Bakken-
  // Staffelung anwenden zu koennen (siehe deriveZonePace). Die Schaetzung
  // nimmt die flache Schwellenpace an, was fuer die grobe Dauer-Kategorie
  // (45s-1min/1-3min/4-5min/8-12min) ausreicht.
  distance_km?: number | null;
}

// Klassifiziert eine tatsaechlich gelaufene Pace fuers Protokollieren
// (Kehrfunktion zu deriveZonePace, das die Pace aus der Zone ableitet) -
// bewusst ueber dieselbe Ableitung wie deriveZonePace statt ueber feste
// Grenzwerte: fuer jede der drei Zonen wird die bei dieser Intervalllaenge
// erwartete Pace berechnet (GA1 aus den Trainingsbereichen/Daniels-VDOT,
// Schwelle nach Bakken um die Intervalllaenge gestaffelt - das
// "Schwellenintervalltempo" -, VO2max flach) und die Zone mit der
// naechstliegenden erwarteten Pace gewaehlt. Liefert null ohne
// vollstaendige Trainingsbereiche des Athleten.
export function classifyPaceZone(
  paceSecPerKm: number,
  zones: SegmentZoneInput,
  context: SegmentPaceContext = {}
): "GA1" | "Schwelle" | "VO2max" | null {
  const candidates: { zone: "GA1" | "Schwelle" | "VO2max"; paceSecPerKm: number }[] = [];
  for (const zone of ["GA1", "Schwelle", "VO2max"] as const) {
    const derived = deriveZonePace(zone, zones, context);
    const derivedSecPerKm = derived ? parsePaceValue(derived) : null;
    if (derivedSecPerKm != null) candidates.push({ zone, paceSecPerKm: derivedSecPerKm });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.paceSecPerKm - paceSecPerKm) - Math.abs(b.paceSecPerKm - paceSecPerKm));
  return candidates[0].zone;
}

/**
 * Leitet einen konkreten Pace-Vorschlag fuer ein Plan-Segment aus der
 * gewaehlten Zone, den individuellen Trainingsbereichen des Athleten und
 * optional dem Segment-Kontext (Typ/Dauer) ab - Grundlage fuer das
 * Autofill im SegmentEditor (siehe applyDerivedPaces unten).
 *
 * - Schwelle: die nach Bakken gestaffelte Pace (paceForIntervalDuration)
 *   fuer die Intervalldauer - bei zeitbasierten Segmenten direkt aus
 *   duration_s, bei km-basierten Segmenten aus distance_km ueber die
 *   Schwellenpace geschaetzt. Nur ohne jede Laengenangabe faellt dies auf
 *   die flache Schwellenpace zurueck.
 * - VO2max: die definierende Pace selbst.
 * - GA1: bewusst NICHT relativ zur Schwellenpace geschaetzt (der Abstand
 *   Schwelle->Easy variiert zu stark zwischen Athleten, siehe Daniels'
 *   VDOT-Tabellen) - stattdessen die Easy-Pace aus der Jack-Daniels-
 *   Zonentabelle (computeDanielsZones) plus 15s/km fuer normale GA1-
 *   Laeufe/Aufwaermen, plus 60s/km fuer Cooldown (spuerbar lockerer,
 *   da bereits ermuedet).
 */
export function deriveZonePace(
  zone: string,
  input: SegmentZoneInput,
  context: SegmentPaceContext = {}
): string | null {
  if (zone === "Schwelle") {
    const threshold = input.threshold_pace_sec_per_km;
    if (threshold === null) return null;
    const durationS = context.duration_s ?? (context.distance_km ? context.distance_km * threshold : null);
    if (durationS) return formatPaceValue(paceForIntervalDuration(durationS, threshold));
    return formatPaceValue(threshold);
  }
  if (zone === "VO2max") {
    return input.vo2max_pace_sec_per_km !== null ? formatPaceValue(input.vo2max_pace_sec_per_km) : null;
  }
  if (zone === "GA1") {
    // Explizite Trainer-Vorgabe (Athletenprofil) hat Vorrang vor der
    // generischen Easy+Offset-Schaetzung unten - analog zu deriveZoneWatts
    // (wattZones.ts) fuer Rad-Aufwaermen/-Cooldown.
    if (context.type === "warmup" && input.warmup_pace_sec_per_km != null) {
      return formatPaceValue(input.warmup_pace_sec_per_km);
    }
    if (context.type === "cooldown" && input.cooldown_pace_sec_per_km != null) {
      return formatPaceValue(input.cooldown_pace_sec_per_km);
    }
    const manual: DanielsManualPaces = { Easy: input.easy_pace_sec_per_km };
    const easyPaceSecPerKm = computeDanielsZones(input, manual).rows.find((r) => r.zone === "Easy")?.paceSecPerKm;
    if (easyPaceSecPerKm == null) return null;
    const offset = context.type === "cooldown" ? 60 : 15;
    return formatPaceValue(easyPaceSecPerKm + offset);
  }
  return null;
}

/**
 * Fuellt die Pace-Felder aller Segmente ohne manuell eingegebenen Wert
 * anhand ihrer Zone (und ihres Typs/ihrer Dauer) auf ("Auto-Vorschlag,
 * ueberschreibbar" - bereits gesetzte Werte bleiben unberuehrt). Wird
 * sowohl beim Anlegen der Default-Segmente (PlanSessionFields) als
 * auch bei jeder Zonen-Aenderung eines einzelnen Segments (SegmentEditor)
 * aufgerufen.
 */
export function applyDerivedPaces(segments: PlanSegment[], zones: SegmentZoneInput | null): PlanSegment[] {
  if (!zones) return segments;
  return segments.map((s) => {
    if (s.pace || !s.zone) return s;
    const derived = deriveZonePace(s.zone, zones, { type: s.type, duration_s: s.duration_s, distance_km: s.distance_km });
    return derived ? { ...s, pace: derived } : s;
  });
}

/**
 * Retargetet die Tempovorgaben einer Einheit (Zielpace + Segment-Paces) auf
 * die Trainingsbereiche eines (ggf. anderen) Athleten - anders als
 * applyDerivedPaces oben, das nur LEERE Paces auffuellt, wird hier ein
 * bereits gesetzter Wert bewusst UEBERSCHRIEBEN, da die Einheit fuer einen
 * neuen Athleten mit eigenen Zonen gedacht ist (siehe CopyPlanForm.tsx:
 * Trainingsplan zwischen Athleten kopieren). Laesst sich fuer die Ziel-Zone
 * keine Pace ableiten (z.B. der Zielathlet hat noch keine Wettkampfzeit
 * hinterlegt), bleibt die urspruengliche Pace erhalten statt sie zu leeren.
 */
export function remapSessionPacesToZones<
  T extends { target_zone?: string | null; target_pace?: string; segments?: PlanSegment[] },
>(session: T, targetZones: SegmentZoneInput): T {
  const target_pace =
    session.target_zone && session.target_pace !== undefined
      ? (deriveZonePace(session.target_zone, targetZones) ?? session.target_pace)
      : session.target_pace;
  const segments = session.segments?.map((s) => {
    if (!s.zone) return s;
    const derived = deriveZonePace(s.zone, targetZones, { type: s.type, duration_s: s.duration_s, distance_km: s.distance_km });
    return derived ? { ...s, pace: derived } : s;
  });
  return { ...session, ...(target_pace !== undefined ? { target_pace } : {}), ...(segments ? { segments } : {}) };
}

// Ergebnis von reclassifyZoneFromActualPace unten: die neue Zielzone, sowie
// bei einem Wechsel in eine strukturierte Zone (Schwelle/VO2max) ein
// einzelnes Intervall-Segment, das die bisher eingegebene Distanz/Pace
// uebernimmt statt sie zu verwerfen.
export interface ActualZoneReclassification {
  target_zone: string;
  segments?: PlanSegment[];
}

/**
 * Passt beim Protokollieren einer nicht-strukturierten Einheit (GA1 ohne
 * Segmente, siehe segmentsVisibleForZone) die trainierte Zone an, wenn die
 * tatsaechlich eingegebene Pace nicht mehr zur bisher gewaehlten Zielzone
 * passt (z.B. ein als "GA1" begonnener Lauf, der tatsaechlich in
 * Schwellentempo gelaufen wurde) - Pendant zur Segment-Klassifizierung in
 * SegmentEditor.tsx (classifyPaceZone), nur eine Ebene hoeher fuer die
 * Ziel-Zone der gesamten Einheit. Betrifft nur die drei Lauf-Pace-Zonen
 * (GA1/Schwelle/VO2max) - Radfahren/Schwimmen haben keine vergleichbare
 * Pace-Tabelle. Liefert null, wenn sich nichts aendert (keine Athletenzonen,
 * ungueltige Pace/Distanz, oder die klassifizierte Zone entspricht bereits
 * der aktuellen).
 */
export function reclassifyZoneFromActualPace(
  currentZone: string,
  pace: string,
  distanceKm: number,
  zones: SegmentZoneInput | null
): ActualZoneReclassification | null {
  if (!zones || !["GA1", "Schwelle", "VO2max"].includes(currentZone)) return null;
  const paceSecPerKm = parsePaceValue(pace);
  if (paceSecPerKm == null || !distanceKm) return null;
  const classified = classifyPaceZone(paceSecPerKm, zones, { distance_km: distanceKm });
  if (!classified || classified === currentZone) return null;
  if (segmentsVisibleForZone(classified)) {
    return {
      target_zone: classified,
      segments: [
        { type: "interval", repeat: 1, distance_km: distanceKm, duration_s: null, pace, watts: null, zone: classified, note: "" },
      ],
    };
  }
  return { target_zone: classified };
}
