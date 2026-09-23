import { formatPaceValue, parsePaceValue } from "@/lib/pace";
import type { PlanSegment, PlannedSession, SegmentType, WeeklyZoneSummary } from "@/types/training";

export const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  warmup: "Aufwärmen",
  steady: "Dauerlauf",
  interval: "Intervall",
  jog_recovery: "Trabpause",
  rest: "Stehpause",
  cooldown: "Cooldown",
};

export const SEGMENT_TYPES: SegmentType[] = [
  "warmup",
  "steady",
  "interval",
  "jog_recovery",
  "rest",
  "cooldown",
];

// Radfahren/Schwimmen lassen sich wie Laufen nach Intensitaet (GA1/
// Schwelle/VO2max) planen - Radfahren nutzt dafuer die FTP-basierten
// Wattzonen (lib/wattZones.ts), Schwimmen hat weiterhin keine
// athletenspezifische Kalibrierung und laeuft rein informativ ueber Dauer
// statt Distanz/Pace (siehe zoneUsesDuration unten). Bewusst nur die drei
// Intensitaetsstufen, kein zusaetzlicher "zonenloser" Eintrag.
export const CYCLING_ZONES = ["Radfahren (GA1)", "Radfahren (Schwelle)", "Radfahren (VO2max)"];
export const SWIMMING_ZONES = ["Schwimmen (GA1)", "Schwimmen (Schwelle)", "Schwimmen (VO2max)"];

// Zonen, bei denen ein strukturierter Ablauf (Segmente) sinnvoll ist -
// bei GA1/ohne Zielzone reicht i.d.R. eine einfache Distanz-/Zeitangabe.
// Radfahren-Schwelle/VO2max sind strukturierbar (Watt-Intervalle, siehe
// SegmentEditor.tsx), Radfahren-GA1 (wie Lauf-GA1) und Schwimmen (keine
// eigene Zonenkalibrierung) nicht. "Sprint/Reps" ist wie Schwelle/VO2max
// strukturiert (z.B. "10x100m"), nur ohne automatische Pace-Ableitung aus
// den Trainingsbereichen (siehe lib/paceZones.ts:deriveZonePace) - die
// Segment-Paces werden dafuer frei eingegeben.
export const SEGMENT_ZONES = ["Schwelle", "VO2max", "Sprint/Reps", "Radfahren (Schwelle)", "Radfahren (VO2max)"];

// Nicht-lauf-zonen-spezifische Einheitstypen (kein Distanz-/Pace-Bezug) -
// laufen ueber die reine Dauer statt km, siehe zoneUsesDuration unten.
// Identische Liste wie backend/app/services/training_zones.py:OTHER_ZONES.
export const OTHER_ZONES = ["Athletik", "Beweglichkeit", "Krafttraining"];

// Methodik-Varianten je Zielzone (siehe types/training.ts:PlannedSession.
// method, backend/app/models/training_plan.py:PlannedSession.method) - ein
// zur Zone zusaetzliches, unabhaengiges Feld statt einer eigenen Zone, da
// z.B. eine Fahrtspiel-Schwelleneinheit weiterhin ganz normal als Schwelle
// in die Zonen-Auswertung (Plan-vs-Ist, km) eingeht. Aktuell nur fuer
// Schwelle: "Intervalle" (die bestehende, feste Segment-Vorlage, siehe
// defaultSegments) oder "Fahrtspiel" (freie, wechselnde Wiederholungsdauern,
// siehe FahrtspielEditor.tsx/fahrtspielSegments unten). Das erste Element
// gilt als Default, sobald die Zone neu gewaehlt wird (siehe
// PlanSessionFields.tsx:setZone).
export const METHODS_BY_ZONE: Record<string, string[]> = {
  Schwelle: ["Intervalle", "Fahrtspiel"],
};

export function methodOptionsForZone(zone: string | null | undefined): string[] {
  return (zone && METHODS_BY_ZONE[zone]) || [];
}

// "Intervalle" ist der implizite Default (siehe METHODS_BY_ZONE) - fuer die
// Anzeige (Badges, Auto-Titel) soll er nicht als Zusatz auftauchen, nur
// "Fahrtspiel" (oder ein zukuenftiger, echter Nicht-Default-Wert) ist
// erwaehnenswert.
export function isNotableMethod(zone: string | null | undefined, method: string | null | undefined): boolean {
  return !!method && method !== (methodOptionsForZone(zone)[0] ?? "");
}

// Fahrtspiel: variable Wiederholungsdauern in Minuten (z.B. "3-4-6-5-7-3"),
// beliebig getrennt (Bindestrich, Komma, Leerzeichen) - anders als die feste
// Intervall-Vorlage (defaultSegments) mit gleich langen Wiederholungen.
export function parseFahrtspielMinutes(input: string): number[] {
  return input
    .split(/[^0-9.,]+/)
    .map((s) => Number(s.replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// Baut aus den Wiederholungsdauern die Segmentliste: je Wiederholung ein
// Intervall-Segment (Zone "Schwelle"), dazwischen (nicht nach der letzten
// Wiederholung) eine Trabpause von einem Drittel der jeweiligen
// Wiederholungsdauer. Das optionale Auf-/Abwaermen wird NICHT hier gebaut,
// sondern vom Aufrufer als eigenstaendiges Segment davor-/dahintergesetzt
// (siehe components/FahrtspielEditor.tsx - dort ueber dieselbe
// SegmentRow-Zeilenkomponente wie die feste Intervall-Vorlage editierbar,
// statt einer eigenen Fahrtspiel-spezifischen Distanzeingabe). Alle Paces
// bleiben hier leer - der Aufrufer befuellt sie per applyDerivedPaces()
// (siehe lib/paceZones.ts) anhand der Intervalldauer (Bakken-Staffelung
// fuer die Belastung, Jack-Daniels-Easy-Pace fuer die Pausen), damit sich
// daraus sowohl eine Tempo-Spanne (formatFahrtspielCompact) als auch eine
// Gesamtdistanz (segmentsTotalKm) ableiten laesst - anders als frueher, wo
// das Tempo komplett unvorgegeben blieb und die Distanz dadurch stets 0
// war.
export function fahrtspielSegments(minutesList: number[]): PlanSegment[] {
  const segments: PlanSegment[] = [];
  minutesList.forEach((minutes, i) => {
    const duration_s = Math.round(minutes * 60);
    segments.push({ type: "interval", repeat: 1, distance_km: null, duration_s, pace: "", watts: null, zone: "Schwelle", note: "" });
    if (i < minutesList.length - 1) {
      segments.push({
        type: "jog_recovery",
        repeat: 1,
        distance_km: null,
        duration_s: Math.round(duration_s / 3),
        pace: "",
        watts: null,
        zone: "GA1",
        note: "",
      });
    }
  });
  return segments;
}

// Kehrfunktion zu fahrtspielSegments - fuer die Anzeige des bisherigen
// Musters beim Bearbeiten einer bestehenden Fahrtspiel-Einheit im
// Textfeld (siehe FahrtspielEditor.tsx).
export function fahrtspielPatternFromSegments(segments: PlanSegment[]): string {
  return segments
    .filter((s) => s.type === "interval" && s.duration_s)
    .map((s) => {
      const minutes = s.duration_s! / 60;
      return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
    })
    .join("-");
}

// Kompakte Einzeiler-Zusammenfassung einer Fahrtspiel-Einheit fuer die
// Plan-/Protokoll-Anzeige (z.B. "3-4-5-6-5-4-3 @3:25-3:18 min/km, 1-2' TP"
// statt einer Zeile je Wiederholung/Pause, siehe
// components/FahrtspielSegmentsView.tsx) - die vollstaendige Aufschluesselung
// bleibt per Ausklappen erreichbar (formatSegment je Segment). Die
// Tempo-Spanne wird bewusst vom langsamsten zum schnellsten Wert
// geschrieben (nicht chronologisch nach Wiederholungsdauer), da laengere
// Wiederholungen nach Bakken langsamer laufen als kuerzere (siehe
// lib/bakkenZones.ts) - "3:25-3:18" liest sich dadurch wie eine uebliche
// Tempospanne (langsames bis schnelles Ende), waehrend die Pausenspanne
// aufsteigend (kuerzeste bis laengste Pause) angegeben wird, wie die
// Wiederholungsdauern selbst.
export function formatFahrtspielCompact(segments: PlanSegment[]): string {
  const intervals = segments.filter((s) => s.type === "interval" && s.duration_s);
  const recoveries = segments.filter((s) => s.type === "jog_recovery" && s.duration_s);
  const pattern = intervals
    .map((s) => {
      const minutes = s.duration_s! / 60;
      return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
    })
    .join("-");
  if (!pattern) return "Fahrtspiel";

  // Tempospanne wird per Leerzeichen an das Muster angehaengt ("3-4-3
  // @3:25-3:18 min/km"), die Pausenspanne dagegen als eigenes, per Komma
  // abgetrenntes Element ("..., 1-2' TP") - beides zusammen bliebe sonst
  // als reine Komma-Aufzaehlung schwerer lesbar als eine einzige
  // zusammenhaengende Belastungsangabe plus separater Pausenhinweis.
  let result = pattern;

  const paces = intervals.map((s) => parsePaceValue(s.pace)).filter((p): p is number => p != null);
  if (paces.length > 0) {
    const slowest = Math.max(...paces);
    const fastest = Math.min(...paces);
    const paceLabel = slowest === fastest ? formatPaceValue(slowest) : `${formatPaceValue(slowest)}-${formatPaceValue(fastest)}`;
    result += ` @${paceLabel} min/km`;
  }

  if (recoveries.length > 0) {
    const fmtMinutes = (s: number) => {
      const minutes = s / 60;
      return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
    };
    const durations = recoveries.map((s) => s.duration_s!);
    const shortest = Math.min(...durations);
    const longest = Math.max(...durations);
    const pauseLabel = shortest === longest ? fmtMinutes(shortest) : `${fmtMinutes(shortest)}-${fmtMinutes(longest)}`;
    result += `, ${pauseLabel}' TP`;
  }

  return result;
}

// Zielzonen/-typen fuer eine ganze Einheit, gruppiert fuers Auswahlfeld
// (siehe components/PlanSessionFields.tsx): die vier Lauf-Pace-Zonen
// (GA1/Schwelle/VO2max/Sprint-Reps), Radfahren/Schwimmen (optional
// ebenfalls nach Intensitaet), sowie OTHER_ZONES als nicht-lauf-
// zonen-spezifische, dauerbasierte Einheitstypen ohne Intensitaetsstufen.
export const TARGET_ZONE_GROUPS: { label: string; zones: string[] }[] = [
  { label: "Laufen", zones: ["GA1", "Schwelle", "VO2max", "Sprint/Reps"] },
  { label: "Radfahren", zones: CYCLING_ZONES },
  { label: "Schwimmen", zones: SWIMMING_ZONES },
  { label: "Sonstiges", zones: OTHER_ZONES },
];

export const TARGET_ZONE_OPTIONS = ["", ...TARGET_ZONE_GROUPS.flatMap((g) => g.zones)];

export function segmentsVisibleForZone(zone: string | null | undefined): boolean {
  return !!zone && SEGMENT_ZONES.includes(zone);
}

// Sportart einer Zielzone, TS-Pendant zu
// backend/app/services/training_zones.py:sport_of_target_zone - genutzt,
// um SegmentEditor.tsx auf Rad-Einheiten umzuschalten (generische "Pause"
// statt Trabpause/Stehpause, Watt- statt Pace-Eingabe, siehe
// components/PlanSessionFields.tsx).
export function sportOfTargetZone(zone: string | null | undefined): "run" | "bike" | "swim" | null {
  if (!zone) return null;
  if (["GA1", "Schwelle", "VO2max", "Sprint/Reps"].includes(zone)) return "run";
  if (CYCLING_ZONES.includes(zone)) return "bike";
  if (SWIMMING_ZONES.includes(zone)) return "swim";
  return null;
}

// Extrahiert aus einer sportspezifischen Zielzone ("Radfahren (Schwelle)",
// "Schwimmen (VO2max)") die blosse Zone ("Schwelle"/"VO2max"), wie sie
// Segmente sowie die Watt-/Pace-Ableitung (lib/wattZones.ts/paceZones.ts)
// und die Backend-Klassifikation (services/zone_classifier.py:
// zone_km_from_target) erwarten. Lauf-Zielzonen sind bereits bloss und
// werden unveraendert durchgereicht. Wird u.a. genutzt, um zu verhindern,
// dass ein Rad-/Schwimm-Segment versehentlich die volle sportspezifische
// Zielzone statt der blossen Zone traegt (siehe defaultSegments unten,
// SegmentEditor.tsx).
export function bareZone(zone: string | null | undefined): string {
  if (!zone) return "";
  return zone.match(/\(([^)]+)\)/)?.[1] ?? zone;
}

// Pivotiert weekly_zone_summary auf die "actual"-Werte je Woche/blosser Zone
// (GA1/Schwelle/VO2max) fuer eine Sportart (Radfahren/Schwimmen), z.B.
// {week_start, GA1, Schwelle, VO2max} - gemeinsam genutzt von
// WeeklyVolumeChart ("Trainingsverlauf") und WeeklyZoneKmChart ("Kilometer
// pro Zone"), die beide dieselben Rad-/Schwimm-Zonentabs (in Minuten)
// zeigen.
export function pivotZoneSummaryBySport(
  data: WeeklyZoneSummary[],
  sportZones: string[]
): { week_start: string; GA1: number; Schwelle: number; VO2max: number }[] {
  const byWeek = new Map<string, Record<string, number>>();
  for (const d of data) {
    if (!sportZones.includes(d.zone)) continue;
    const entry = byWeek.get(d.week_start) ?? {};
    const zone = bareZone(d.zone);
    entry[zone] = (entry[zone] ?? 0) + d.actual;
    byWeek.set(d.week_start, entry);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, zones]) => ({
      week_start,
      GA1: zones.GA1 ?? 0,
      Schwelle: zones.Schwelle ?? 0,
      VO2max: zones.VO2max ?? 0,
    }));
}

// Fuellt fehlende Wochen (siehe weeksInRange) mit einem Nullwert-Eintrag auf,
// damit eine Wochen-x-Achse jede Woche des Zeitraums zeigt, auch ohne
// Backend-Datenpunkt.
export function padWeeks<T extends { week_start: string }>(
  rows: T[],
  weeks: string[],
  zeroRow: (week_start: string) => T
): T[] {
  const byWeek = new Map(rows.map((r) => [r.week_start, r]));
  return weeks.map((week_start) => byWeek.get(week_start) ?? zeroRow(week_start));
}

// Segmenttypen fuer Rad-Einheiten: wie beim Laufen, aber ohne Trabpause
// (jog_recovery) - Radfahren unterscheidet nicht zwischen "trabender" und
// "stehender" Pause, beides ist schlicht "Pause" (der bestehende Typ
// "rest" passt semantisch bereits: keine Distanz, kein Tempo/keine Zone,
// nur eine Dauer).
export const CYCLING_SEGMENT_TYPES: SegmentType[] = ["warmup", "steady", "interval", "rest", "cooldown"];

export function segmentTypesForSport(sport: "run" | "bike" | "swim" | null): SegmentType[] {
  return sport === "bike" ? CYCLING_SEGMENT_TYPES : SEGMENT_TYPES;
}

export function segmentTypeLabel(type: SegmentType, sport: "run" | "bike" | "swim" | null): string {
  if (sport === "bike" && type === "rest") return "Pause";
  return SEGMENT_TYPE_LABEL[type];
}

// Zahl ohne unnoetige Nachkommastellen fuer den Auto-Titel (12 statt 12.0,
// aber 21.1 statt 21.1000000001) - Rundungsfehler aus Number()-Eingaben
// wuerden sonst haessliche Titel wie "12.000000001km DL" erzeugen.
function formatCompactNumber(value: number, decimals = 1): string {
  return Number(value.toFixed(decimals)).toString();
}

// Leitet den Titel einer Einheit automatisch aus ihrer Kernbelastung ab,
// z.B. "12km DL" (GA1-Dauerlauf), "4×1000m" (strukturierte Schwellen-/
// VO2max-Einheit, aus dem Kernintervall) oder "60min" (dauerbasierte
// Einheitstypen) - siehe PlanSessionFields.tsx, das den Titel bei jeder
// Aenderung von Zone/Distanz/Dauer/Segmenten damit aktuell haelt, solange
// er nicht manuell ueberschrieben wurde. Die Zielzone selbst taucht im
// Titel bewusst NICHT mehr auf (sie steht bereits als eigenes Badge daneben,
// siehe z.B. components/ActivityCard.tsx/PlanProtokollDayRows.tsx) - eine
// Wiederholung im Titeltext waere redundant. Liefert "", solange sich noch
// keine Kernbelastung ableiten laesst (z.B. keine Zielzone gewaehlt oder
// eine strukturierte Einheit noch ohne Segmente) - dann bleibt das
// Titelfeld frei editierbar, z.B. fuer einen Wettkampfnamen.
export function computeAutoTitle(value: {
  target_zone: string;
  target_distance_km: string;
  target_duration_min: string;
  segments: PlanSegment[];
}): string {
  const zone = value.target_zone;
  if (!zone) return "";

  if (segmentsVisibleForZone(zone)) {
    // Kerneinheit einer strukturierten Einheit ist das erste Intervall-
    // Segment (Auf-/Abwaermen und Trabpausen sind Beiwerk).
    const core = value.segments.find((s) => s.type === "interval");
    if (!core) return "";
    const repeat = core.repeat || 1;
    if (core.distance_km) {
      const meters = core.distance_km * 1000;
      const distanceLabel = meters <= 1000 ? `${Math.round(meters)}m` : `${formatCompactNumber(core.distance_km)}km`;
      return repeat > 1 ? `${repeat}×${distanceLabel}` : distanceLabel;
    }
    if (core.duration_s) {
      const minutesLabel = `${formatCompactNumber(core.duration_s / 60)}min`;
      return repeat > 1 ? `${repeat}×${minutesLabel}` : minutesLabel;
    }
    return "";
  }

  if (zoneUsesDuration(zone)) {
    const minutes = Number(value.target_duration_min) || 0;
    return minutes > 0 ? `${formatCompactNumber(minutes)}min` : "";
  }

  // Einzige verbleibende, nicht-strukturierte, distanzbasierte Zone: GA1
  // ("DL" = Dauerlauf, gaengige Lauf-Kurzform statt der Zonenbezeichnung).
  const distanceKm = Number(value.target_distance_km) || 0;
  if (distanceKm > 0) return `${formatCompactNumber(distanceKm)}km DL`;
  return "";
}

// Dauer statt Distanz - eine Kilometerangabe ergibt fuer OTHER_ZONES keinen
// Sinn im Lauf-Zonenmodell (siehe PlannedSession.target_duration_s statt
// target_distance_km). Radfahren/Schwimmen zaehlen unabhaengig von der
// gewaehlten Intensitaetsstufe dazu, da dafuer keine Pace-Ableitung existiert.
const DURATION_ZONES = [...OTHER_ZONES, ...CYCLING_ZONES, ...SWIMMING_ZONES];

export function zoneUsesDuration(zone: string | null | undefined): boolean {
  return !!zone && DURATION_ZONES.includes(zone);
}

export function emptySegment(): PlanSegment {
  return { type: "interval", repeat: 1, distance_km: null, duration_s: null, pace: "", watts: null, zone: null, note: "" };
}

// Vorbelegung fuer den Regelfall einer Schwellen-/VO2max-Einheit, damit
// nicht jedes Mal 4x "+ Segment hinzufuegen" geklickt werden muss. Auf-/
// Abwaermen mit gaengigen Standarddistanzen vorbelegt (aber danach frei
// editierbar, siehe SegmentEditor.tsx), Intervall uebernimmt die Zielzone
// der Einheit ("Hauptbelastung") - siehe PlanSessionFields.tsx:setZone,
// das beide bei einem spaeteren Zonenwechsel synchron haelt. Bei Rad-
// Einheiten (isCycling) heisst die Erholung zwischen Intervallen "Pause"
// (Typ "rest") statt Trabpause ("jog_recovery") - siehe sportOfTargetZone/
// CYCLING_SEGMENT_TYPES.
export function defaultSegments(targetZone: string | null = null): PlanSegment[] {
  const isCycling = sportOfTargetZone(targetZone) === "bike";
  const recoveryType: SegmentType = isCycling ? "rest" : "jog_recovery";
  return [
    { type: "warmup", repeat: 1, distance_km: isCycling ? null : 3, duration_s: isCycling ? 300 : null, pace: "", watts: null, zone: "GA1", note: "" },
    // Fuer Rad-Intervalle Standarddauer 3min - die "klassische"
    // Schwellenintervall-Laenge, bei der die Watt-Ableitung genau die volle
    // FTP vorschlaegt (siehe lib/wattZones.ts:thresholdPctForDuration).
    {
      type: "interval",
      repeat: 1,
      distance_km: null,
      duration_s: isCycling ? 180 : null,
      pace: "",
      watts: null,
      zone: bareZone(targetZone),
      note: "",
    },
    { type: recoveryType, repeat: 1, distance_km: null, duration_s: null, pace: "", watts: null, zone: isCycling ? null : "GA1", note: "" },
    { type: "cooldown", repeat: 1, distance_km: isCycling ? null : 2, duration_s: isCycling ? 300 : null, pace: "", watts: null, zone: "GA1", note: "" },
  ];
}

// Distanz eines einzelnen Segments in km (inkl. Wiederholungen). Bei einem
// Distanz-Segment direkt aus distance_km; bei einem Minutenlauf
// (duration_s statt distance_km, siehe SegmentEditor.tsx) aus Dauer und
// Tempo abgeleitet - sonst wuerde ein Minutenintervall (z.B. "4x 3min
// Schwelle") mit 0 km in die Gesamtdistanz eingehen, obwohl dabei
// tatsaechlich eine Strecke zurueckgelegt wird.
export function segmentDistanceKm(segment: PlanSegment): number {
  const repeat = segment.repeat || 1;
  if (segment.distance_km) return segment.distance_km * repeat;
  if (segment.duration_s) {
    const paceSecPerKm = parsePaceValue(segment.pace);
    if (paceSecPerKm) return (segment.duration_s / paceSecPerKm) * repeat;
  }
  return 0;
}

export function segmentsTotalKm(segments: PlanSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentDistanceKm(s), 0);
}

// Distanz je Zone (GA1/Schwelle/VO2max/Sprint-Reps) ueber alle Segmente
// einer Einheit summiert - Ergaenzung zu segmentsTotalKm fuer die
// Zonen-Aufschluesselung einer strukturierten Einheit (v.a. Fahrtspiel,
// siehe components/FahrtspielSegmentsView.tsx), analog zur
// wochenweisen Zonen-Aufschluesselung in PlanProtokollDayRows.tsx
// (plannedByZone), nur je Einheit statt je Woche und direkt aus den
// Segmenten statt aus der Zielzone der gesamten Einheit.
export function segmentsKmByZone(segments: PlanSegment[]): Record<string, number> {
  const byZone: Record<string, number> = {};
  for (const s of segments) {
    if (!s.zone) continue;
    const km = segmentDistanceKm(s);
    if (km <= 0) continue;
    byZone[s.zone] = (byZone[s.zone] ?? 0) + km;
  }
  return byZone;
}

// Zeit eines einzelnen Segments in Sekunden (vor Rundung, inkl.
// Wiederholungen): direkt aus duration_s, sonst aus distance_km * Tempo.
// null, wenn weder Dauer noch (Distanz + gueltiges "mm:ss"-Tempo)
// vorliegen - dann laesst sich die Segmentzeit nicht ableiten.
function segmentDurationS(segment: PlanSegment): number | null {
  const repeat = segment.repeat || 1;
  if (segment.duration_s) return segment.duration_s * repeat;
  if (segment.distance_km) {
    const paceSecPerKm = parsePaceValue(segment.pace);
    if (paceSecPerKm != null) return segment.distance_km * paceSecPerKm * repeat;
  }
  return null;
}

// Gesamtzeit einer strukturierten Einheit (Schwelle/VO2max), automatisch
// aus den Distanzen und Tempos der einzelnen Segmente berechnet und auf
// die volle Sekunde gerundet - fuers Protokollieren einer tatsaechlich
// gelaufenen Einheit (siehe ManualActivityForm/ActivityList), damit die
// Gesamtzeit nicht manuell aufaddiert werden muss. Liefert null, wenn
// mindestens ein Segment weder Dauer noch (Distanz + Tempo) hat - eine
// Teilsumme wuerde die tatsaechliche Zeit sonst stillschweigend unterschaetzen.
export function segmentsTotalDurationS(segments: PlanSegment[]): number | null {
  if (segments.length === 0) return null;
  let total = 0;
  for (const segment of segments) {
    const durationS = segmentDurationS(segment);
    if (durationS == null) return null;
    total += durationS;
  }
  return Math.round(total);
}

// Gesamtzeit einer protokollierten Aktivitaet, automatisch aus Distanz und
// Tempo berechnet (auf die Sekunde gerundet) statt manuell eingegeben -
// gemeinsam genutzt von ManualActivityForm.tsx und ActivityList.tsx, damit
// Anlegen und Bearbeiten identisch rechnen. Bei strukturierten Einheiten
// (Schwelle/VO2max) aus den Segmenten (segmentsTotalDurationS), sonst aus
// der Gesamtdistanz und dem separat erfassten Tempo `actualPace`
// ("mm:ss"). null, wenn sich die Zeit nicht berechnen laesst (fehlende
// Distanz/Tempo bzw. ein unvollstaendiges Segment).
export function computeActualDurationS(
  targetZone: string,
  targetDistanceKm: string,
  segments: PlanSegment[],
  actualPace: string
): number | null {
  const segmentsVisible = segmentsVisibleForZone(targetZone);
  if (segmentsVisible) return segmentsTotalDurationS(segments);
  const distanceKm = Number(targetDistanceKm) || 0;
  const paceSecPerKm = parsePaceValue(actualPace);
  return distanceKm > 0 && paceSecPerKm != null ? Math.round(distanceKm * paceSecPerKm) : null;
}

export function formatDurationS(durationS: number): string {
  const minutes = durationS / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}min`;
}

// Distanzanzeige: Intervalle unter 1km werden lesbarer in Metern angezeigt
// (z.B. "400 m" statt "0.4 km") statt wie laengere Strecken in km mit einer
// Nachkommastelle.
export function formatDistanceKm(km: number): string {
  const meters = km * 1000;
  return meters < 1000 ? `${Math.round(meters)} m` : `${km.toFixed(1)} km`;
}

// Zeitangabe einer Sprint/Reps-Wiederholung (z.B. "13s"/"8.4s") - anders
// als formatDurationS (Minuten, "12min") bewusst in Sekunden mit bis zu
// einer Nachkommastelle, da Sprintzeiten dafuer zu kurz sind.
function formatSprintSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

export function formatSegment(segment: PlanSegment): string {
  const parts: string[] = [];
  if (segment.repeat > 1) parts.push(`${segment.repeat}×`);
  // Sprint/Reps-Wiederholungen tragen Distanz UND Zeit gleichzeitig (z.B.
  // "6×100m Intervall in 13s"), da sich eine Pace/km bei so kurzen
  // Distanzen nicht sinnvoll bilden laesst (siehe deriveSegmentPatch/
  // components/SegmentRow.tsx) - beide Felder sind bei diesen Segmenten
  // direkt gesetzt (distance_km UND duration_s), waehrend sich sonst genau
  // eines der beiden aus dem anderen ergibt.
  if (segment.zone === "Sprint/Reps" && segment.distance_km && segment.duration_s) {
    parts.push(formatDistanceKm(segment.distance_km));
    parts.push(SEGMENT_TYPE_LABEL[segment.type]);
    parts.push(`in ${formatSprintSeconds(segment.duration_s)}`);
  } else {
    if (segment.distance_km) parts.push(formatDistanceKm(segment.distance_km));
    else if (segment.duration_s) parts.push(formatDurationS(segment.duration_s));
    parts.push(SEGMENT_TYPE_LABEL[segment.type]);
    if (segment.pace) parts.push(`@ ${segment.pace}/km`);
  }
  if (segment.zone) parts.push(`(${segment.zone})`);
  if (segment.note) parts.push(`– ${segment.note}`);
  return parts.join(" ");
}

export const WEEKDAY_LABELS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Gibt Datumsteile IMMER lokal zurueck (kein toISOString()-Umweg): eine
// via new Date(iso + "T00:00:00") + setDate() konstruierte lokale
// Mitternacht laege in Zeitzonen mit positivem UTC-Offset (z.B.
// Europe/Berlin) am Vortag, sobald man sie ueber toISOString() (UTC)
// wieder in einen Datumsstring umwandelt - genau dieser Bug sass vorher
// in mondayOf()/addDays() und verschob jede Wochensumme einen Tag zu
// frueh.
function formatLocalIso(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dayIso: string, days: number): string {
  const d = new Date(`${dayIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatLocalIso(d);
}

// Alle Tage von `start` (inklusive) bis `end` (exklusiv) - identisch zum
// [start, end)-Fenster von WeekMonthNav.rangeFor. Gemeinsam genutzt von
// ManualActivityDayBoxes und PlanProtokollDayRows, die beide denselben
// sichtbaren Zeitraum tageweise als Kaesten/Zeilen darstellen.
export function daysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) days.push(day);
  return days;
}

// Tage zwischen zwei lokalen Datums-Strings (b - a) - fuer das Kopieren
// eines Trainingszeitraums (siehe CopyPlanForm.tsx): der Tages-Offset
// einer Quell-Einheit innerhalb des Quellzeitraums wird auf den
// Zielzeitraum uebertragen.
export function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db.getTime() - da.getTime()) / msPerDay);
}

export function todayLocalIso(): string {
  return formatLocalIso(new Date());
}

// 1. des Monats, in dem `dayIso` liegt - fuer die Monatsnavigation im
// Trainingsplan (WeekMonthNav.tsx), analog zu mondayOf() fuer Wochen.
export function firstOfMonth(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00`);
  d.setDate(1);
  return formatLocalIso(d);
}

export function addMonths(dayIso: string, months: number): string {
  const d = new Date(`${dayIso}T00:00:00`);
  d.setDate(1); // vermeidet Ueberlauf in kuerzere Folgemonate (z.B. 31. Jan + 1 Monat)
  d.setMonth(d.getMonth() + months);
  return formatLocalIso(d);
}

export const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function shortDayLabel(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// Kurzer Wochentag ("Mo", "Di", ...) zu einem Datum - zur Anzeige neben dem
// Datum in Plan/Protokoll (siehe PlanSessionList.tsx, ActivityList.tsx),
// da das reine ISO-Datum den Wochentag nicht erkennen laesst.
export function shortWeekdayLabel(dayIso: string): string {
  const weekday = (new Date(`${dayIso}T00:00:00`).getDay() + 6) % 7; // Montag = 0 ... Sonntag = 6
  return WEEKDAY_LABELS[weekday].slice(0, 2);
}

// ISO-Datum (yyyy-mm-dd) fuer die Anzeige nach dd/mm/yyyy umformatiert -
// die vom Backend gelieferten/gespeicherten Werte bleiben ISO (siehe
// Activity.day/PlannedSession.day), nur die Darstellung in Plan/Protokoll
// (PlanSessionList.tsx, ActivityList.tsx, overview/page.tsx) folgt dem
// gewuenschten dd/mm/yyyy-Format.
export function formatDateDMY(dayIso: string): string {
  const [year, month, day] = dayIso.split("-");
  return `${day}/${month}/${year}`;
}

// ISO-8601-Kalenderwoche eines Datums (Woche mit dem ersten Donnerstag des
// Jahres ist KW1) - fuer die x-Achsen-Beschriftung "KW n" im
// Wochenkilometer-Chart (siehe WeeklyVolumeChart.tsx), das sonst das volle
// week_start-Datum anzeigen wuerde.
export function isoWeekLabel(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00`);
  // Naechster Donnerstag derselben ISO-Woche bestimmt das Kalenderjahr der
  // Woche (kann vom Kalenderjahr des Datums abweichen, z.B. 30.12.2024 =
  // KW1 2025) - Standardverfahren fuer die ISO-8601-Wochennummer.
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `KW ${weekNumber}`;
}

export interface DayGroup<T> {
  day: string;
  items: T[];
}

// Gruppiert protokollierte/geplante Einheiten nach Tag (chronologisch nach
// Datum aufsteigend) - mehrere Einheiten desselben Tages landen in einer
// gemeinsamen Gruppe, damit sie in einem Kasten statt in mehreren
// einzelnen Kaesten angezeigt werden (siehe components/ActivityList.tsx,
// components/PlanSessionList.tsx).
export function groupByDay<T extends { day: string }>(items: T[]): DayGroup<T>[] {
  return Array.from(indexByDay(items).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
}

// Dieselbe Gruppierung wie groupByDay, aber als Map statt als sortierte
// Liste - fuer Ansichten, die umgekehrt vom Tag ausgehen und je Kalendertag
// "was liegt an diesem Tag?" nachschlagen (siehe PlanProtokollDayRows, das
// eine Zeile je Tag des Zeitraums rendert). Einmal indexieren und dann je
// Tag nachschlagen ist O(Einheiten + Tage), statt fuer jeden Tag erneut die
// gesamte Liste zu durchsuchen (O(Tage x Einheiten)).
export function indexByDay<T extends { day: string }>(items: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const existing = byDay.get(item.day);
    if (existing) existing.push(item);
    else byDay.set(item.day, [item]);
  }
  return byDay;
}

// Formatiert den sichtbaren Zeitraum fuer WeekMonthNav: `end` ist exklusiv,
// daher fuer die Anzeige einen Tag zurueckrechnen.
export function formatRangeLabel(mode: "week" | "month", start: string, end: string): string {
  if (mode === "month") {
    const d = new Date(`${start}T00:00:00`);
    return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  }
  // Kalenderwoche dahinter anzeigen, ueberall wo eine Woche als
  // Datumsspanne auftaucht (siehe auch formatWeekRange unten) - macht die
  // Wochenzugehoerigkeit auf einen Blick klar, ohne selbst nachzuzaehlen.
  return `${shortDayLabel(start)}–${shortDayLabel(addDays(end, -1))} (${isoWeekLabel(start)})`;
}

// Montag der ISO-Kalenderwoche eines Datums - identisch zur
// Wochengruppierung in backend/app/services/analytics.py:weekly_volume,
// damit Plan-Wochensummen und Ist-Wochenkilometer vergleichbar sind.
export function mondayOf(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00`);
  const weekday = (d.getDay() + 6) % 7; // Montag = 0 ... Sonntag = 6
  d.setDate(d.getDate() - weekday);
  return formatLocalIso(d);
}

// Alle Wochenanfaenge (Montage), deren Woche das [start, end)-Fenster
// beruehrt - Grundlage dafuer, dass Zeitraum-Charts (Trainingsverlauf,
// Eff. VO2max, Trainingserfuellung, Kilometer pro Zone) wirklich jede Woche
// des gewaehlten Zeitraums zeigen, auch ohne Backend-Datenpunkt (das
// Backend laesst Wochen ohne Daten teils weg).
export function weeksInRange(start: string, end: string): string[] {
  const weeks: string[] = [];
  for (let week = mondayOf(start); week < end; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

// "Woche 01.09–07.09" - gemeinsames Format fuer Wochen-Kopfzeilen
// (PlanProtokollDayRows.tsx).
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)}–${fmt(end)} (${isoWeekLabel(weekStart)})`;
}

export interface DayWeekGroup {
  weekStart: string;
  days: string[];
}

// Gruppiert eine bereits chronologisch sortierte Liste von ISO-Tagen nach
// Kalenderwoche (Montag-Start, siehe mondayOf) - Grundlage fuer Wochen-
// Kopfzeilen mit Plan-vs-Ist-Summen ueber einen Tage-Bereich, der auch
// mehrere Wochen umfassen kann (Monatsansicht, siehe PlanProtokollDayRows.tsx).
export function groupDaysByWeek(days: string[]): DayWeekGroup[] {
  const byWeek = new Map<string, string[]>();
  for (const day of days) {
    const weekStart = mondayOf(day);
    const existing = byWeek.get(weekStart);
    if (existing) existing.push(day);
    else byWeek.set(weekStart, [day]);
  }
  return Array.from(byWeek.entries()).map(([weekStart, weekDays]) => ({ weekStart, days: weekDays }));
}

