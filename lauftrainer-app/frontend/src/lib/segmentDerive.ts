import { parsePaceValue } from "@/lib/pace";
import { bareZone } from "@/lib/plan";
import { classifyPaceZone, deriveZonePace, type SegmentZoneInput } from "@/lib/paceZones";
import { classifyWattZone, deriveZoneWatts, type WattZoneInput } from "@/lib/wattZones";
import type { PlanSegment } from "@/types/training";

const NO_REPEAT_TYPES = new Set(["warmup", "cooldown"]);

// Interval-Laenge eines Segments in km, um aus Pace + Laenge die Zone zu
// klassifizieren (siehe classifyPaceZone) - bei zeitbasierten Segmenten ueber
// die eingegebene Pace geschaetzt (analog zur Bakken-Staffelung in
// paceZones.ts:deriveZonePace, die denselben Zusammenhang in die andere
// Richtung nutzt).
function classificationDistanceKm(segment: PlanSegment, paceSecPerKm: number | null): number | null {
  if (segment.distance_km) return segment.distance_km;
  if (segment.duration_s && paceSecPerKm) return segment.duration_s / paceSecPerKm;
  return null;
}

export interface SegmentDeriveContext {
  mode: "plan" | "log";
  isCycling: boolean;
  targetZone: string | null;
  athleteZones: SegmentZoneInput | null;
  athleteWattZones: WattZoneInput | null;
}

// Berechnet den vollstaendigen, anzuwendenden Patch fuer eine
// Segment-Aenderung inkl. aller Struktur-Vorgaben (Auf-/Abwaermen nie
// wiederholt, Stehpause ohne Tempo/Zone, Intervall-Zone folgt im Plan-
// Modus der Zielzone) und Auto-Vorschlaege (Pace-/Watt-/Zonen-Ableitung) -
// extrahiert aus components/SegmentEditor.tsx (dort urspruenglich als
// `updateSegment`, an Segmentliste + Index gebunden), damit dieselbe Logik
// auch fuer einzeln (ausserhalb einer Segmentliste) verwaltete Segmente
// gilt - siehe components/FahrtspielEditor.tsx, das Auf-/Abwaermen einer
// Fahrtspiel-Einheit mit demselben Zeilen-UI wie SegmentEditor
// (components/SegmentRow.tsx) darstellt, sie aber als eigenstaendige
// Segmente statt als Teil einer generischen Segmentliste haelt.
export function deriveSegmentPatch(
  segment: PlanSegment,
  rawPatch: Partial<PlanSegment>,
  ctx: SegmentDeriveContext
): Partial<PlanSegment> {
  let patch = rawPatch;
  const nextType = patch.type ?? segment.type;
  const { mode, isCycling, targetZone, athleteZones, athleteWattZones } = ctx;

  // Sprint/Reps-Bloecke lassen sich nicht ueber eine Pace-pro-km-Grenze
  // klassifizieren (die "Pace" ist bei ihnen eine Zielzeit in Sekunden fuer
  // eine kurze Distanz, kein Tempo/km - siehe SegmentRow.tsx) - die Zone
  // bleibt daher wie bei einer Trabpause strukturell an die Zielzone
  // gebunden, in BEIDEN Modi (nicht nur beim Planen wie beim regulaeren
  // Intervall unten), statt beim Protokollieren ueber die (fuer Sprints
  // sinnlose) classifyPaceZone-Ableitung bestimmt zu werden bzw. ganz ohne
  // Zone zu bleiben.
  const isSprintReps = nextType === "interval" && bareZone(targetZone) === "Sprint/Reps";

  if (NO_REPEAT_TYPES.has(nextType)) patch = { ...patch, repeat: 1 };
  if (nextType === "rest") {
    patch = {
      ...patch,
      pace: "",
      watts: isCycling ? (patch.watts ?? segment.watts ?? null) : null,
      zone: null,
      distance_km: null,
      duration_s: patch.duration_s ?? segment.duration_s ?? 0,
    };
  } else if (nextType === "jog_recovery") {
    patch = { ...patch, zone: "GA1" };
  } else if (nextType === "interval" && (mode === "plan" || isSprintReps)) {
    patch = { ...patch, zone: bareZone(targetZone) };
    // Sprint/Reps nutzt statt der Pace direkt Distanz UND Zeit (siehe
    // components/SegmentRow.tsx) - das pace-Feld bleibt daher ungenutzt und
    // wird leer gehalten, statt einen veralteten Wert aus einem frueheren
    // Zonenwechsel stehen zu lassen.
    if (isSprintReps) patch = { ...patch, pace: "" };
  }

  if (mode === "log") {
    const zoneRelevantChange =
      !isSprintReps &&
      nextType !== "jog_recovery" &&
      nextType !== "rest" &&
      (patch.pace !== undefined ||
        patch.watts !== undefined ||
        patch.distance_km !== undefined ||
        patch.duration_s !== undefined ||
        patch.type !== undefined);
    if (zoneRelevantChange && isCycling && athleteWattZones) {
      const merged = { ...segment, ...patch };
      if (merged.watts != null) {
        const classified = classifyWattZone(merged.watts, athleteWattZones);
        if (classified) patch = { ...patch, zone: classified };
      }
    } else if (zoneRelevantChange && !isCycling && athleteZones) {
      const merged = { ...segment, ...patch };
      const paceSecPerKm = parsePaceValue(merged.pace);
      const distanceKm = classificationDistanceKm(merged, paceSecPerKm);
      if (paceSecPerKm != null && distanceKm) {
        const classified = classifyPaceZone(paceSecPerKm, athleteZones, {
          type: merged.type,
          duration_s: merged.duration_s,
          distance_km: merged.distance_km,
        });
        if (classified) patch = { ...patch, zone: classified };
      }
    }
    return patch;
  }

  const zoneRelevantChange =
    patch.zone !== undefined ||
    patch.type !== undefined ||
    patch.duration_s !== undefined ||
    patch.distance_km !== undefined;
  if (zoneRelevantChange && isCycling && athleteWattZones) {
    const merged = { ...segment, ...patch };
    if (merged.zone) {
      const previousDerived = segment.zone
        ? deriveZoneWatts(segment.zone, athleteWattZones, { duration_s: segment.duration_s, type: segment.type })
        : null;
      const wattsIsAuto = segment.watts == null || segment.watts === previousDerived;
      if (wattsIsAuto) {
        const derived = deriveZoneWatts(merged.zone, athleteWattZones, { duration_s: merged.duration_s, type: merged.type });
        if (derived != null) patch = { ...patch, watts: derived };
      }
    }
  } else if (zoneRelevantChange && !isCycling && athleteZones) {
    const merged = { ...segment, ...patch };
    if (merged.zone) {
      const previousDerived = segment.zone
        ? deriveZonePace(segment.zone, athleteZones, {
            type: segment.type,
            duration_s: segment.duration_s,
            distance_km: segment.distance_km,
          })
        : null;
      const paceIsAuto = !segment.pace || segment.pace === previousDerived;
      const forceRecompute = patch.distance_km !== undefined && merged.zone === "Schwelle";
      if (paceIsAuto || forceRecompute) {
        const derived = deriveZonePace(merged.zone, athleteZones, {
          type: merged.type,
          duration_s: merged.duration_s,
          distance_km: merged.distance_km,
        });
        if (derived) patch = { ...patch, pace: derived };
      }
    }
  }
  return patch;
}
