/**
 * Trainingspace-Zonen nach Jack Daniels ("Daniels' Running Formula"):
 * VDOT aus der besten hinterlegten Wettkampfzeit (Daniels-Gilbert-Formel -
 * identisch zu backend/app/services/analytics.py:effective_vo2max, hier
 * client-seitig gespiegelt, da wir zusaetzlich die Geschwindigkeit BEI
 * VDOT brauchen, was eine Umkehrung der Formel erfordert, die das Backend
 * nicht braucht), daraus vVO2max (Pace bei VO2max) und die 5 Zonen als
 * Prozentsatz von vVO2max.
 *
 * Prozentsaetze sind eine gerundete Naeherung an Daniels' empirische VDOT-
 * Tabellen (kein einfache Formel im Original) - bei Bedarf hier anpassen.
 * Eigenstaendiges Modell, unabhaengig von der bestehenden GA1/Schwelle/
 * VO2max-Klassifizierung (services/zone_classifier.py).
 */

export interface DanielsInput {
  race_5k_time_s: number | null;
  race_10k_time_s: number | null;
  race_hm_time_s: number | null;
  race_marathon_time_s: number | null;
}

// Manuelle Ueberschreibung je Daniels-Zone (Sekunden/km), jede Zone
// unabhaengig von den anderen setzbar - fehlt eine, faellt genau diese
// Zone auf den aus dem VDOT berechneten Wert zurueck (siehe
// computeDanielsZones). Threshold/Interval sind absichtlich dieselben
// Felder wie die Schwellen-/VO2max-Pace der 3-Zonen-Klassifizierung
// (services/zone_classifier.py bzw. lib/paceZones.ts), da beide
// Zonenmodelle an diesen beiden Punkten uebereinstimmen.
export interface DanielsManualPaces {
  Easy?: number | null;
  Marathon?: number | null;
  Threshold?: number | null;
  Interval?: number | null;
  Repetition?: number | null;
}

// Vom Trainer direkt gesetzte obere/untere Pace-Grenze je Zone (statt eines
// einzelnen Mittelwerts, aus dem die Grenzen sonst ueber die Nachbarzonen
// angenaehert wuerden, siehe computeDanielsZones) - "min" die schnellere
// (kleinerer Sekundenwert), "max" die langsamere Grenze. Nur wirksam, wenn
// beide Werte einer Zone gesetzt sind; sonst faellt die Zone auf die
// Nachbar-Naeherung (ggf. mit dem einzelnen DanielsManualPaces-Wert) zurueck.
export interface DanielsManualBounds {
  Easy?: { min: number | null; max: number | null } | null;
  Marathon?: { min: number | null; max: number | null } | null;
  Threshold?: { min: number | null; max: number | null } | null;
  Interval?: { min: number | null; max: number | null } | null;
  Repetition?: { min: number | null; max: number | null } | null;
}

const RACES: { key: keyof DanielsInput; distanceM: number }[] = [
  { key: "race_5k_time_s", distanceM: 5000 },
  { key: "race_10k_time_s", distanceM: 10000 },
  { key: "race_hm_time_s", distanceM: 21097.5 },
  { key: "race_marathon_time_s", distanceM: 42195 },
];

const ZONES: { zone: string; pctVvo2max: number }[] = [
  { zone: "Easy", pctVvo2max: 0.7 },
  { zone: "Marathon", pctVvo2max: 0.8 },
  { zone: "Threshold", pctVvo2max: 0.86 },
  { zone: "Interval", pctVvo2max: 0.98 },
  { zone: "Repetition", pctVvo2max: 1.05 },
];

function vdotFromPerformance(distanceM: number, durationS: number): number | null {
  if (durationS <= 0 || distanceM <= 0) return null;
  const t = durationS / 60; // Minuten
  const velocity = distanceM / t; // m/min
  const vo2 = -4.6 + 0.182258 * velocity + 0.000104 * velocity ** 2;
  const pctVo2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pctVo2max;
}

function velocityAtVdot(vdot: number): number {
  // Umkehrung von vo2 = -4.6 + 0.182258*v + 0.000104*v^2 nach v (positive Wurzel)
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vdot);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); // m/min
}

function paceSecPerKm(velocityMPerMin: number): number {
  return 60000 / velocityMPerMin;
}

function formatPace(secPerKm: number): string {
  const rounded = Math.round(secPerKm);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

function bestVdot(user: DanielsInput): number | null {
  let best: number | null = null;
  for (const race of RACES) {
    const time = user[race.key];
    if (!time) continue;
    const vdot = vdotFromPerformance(race.distanceM, time);
    if (vdot !== null && (best === null || vdot > best)) best = vdot;
  }
  return best;
}

export interface DanielsZoneRow {
  zone: string;
  // Einzelwert (Mittelpunkt der Zone) - Grundlage der GA1-Pace-Ableitung
  // in lib/paceZones.ts:deriveZonePace (Easy +15s/+60s). Manuell
  // ueberschriebene Zonen liefern hier direkt den manuellen Wert.
  paceSecPerKm: number | null;
  // Tempobereich der Zone (Pacezone), begrenzt durch die Mittelpunkte zu
  // den (jeweils effektiven, d.h. manuell oder berechneten) Nachbarzonen -
  // fuer die Anzeige in DanielsZoneTable.
  paceRange: string;
  // true, wenn dieser Wert eine manuelle Ueberschreibung ist statt aus dem
  // VDOT berechnet - fuer die Anzeige/Bearbeitung in DanielsZoneTable.
  isManual: boolean;
  // Die beiden Grenzen von paceRange als Rohwerte (Sekunden/km) statt als
  // formatierter Text - fuer DanielsZoneTable, um beim manuellen Bearbeiten
  // die berechneten Grenzen als Eingabe-Platzhalter zeigen zu koennen. Null,
  // wenn an dieser Stelle keine Grenze existiert (offener Rand oder keine
  // Daten, siehe paceRange).
  rangeMinSecPerKm: number | null;
  rangeMaxSecPerKm: number | null;
}

// Jede Zone unabhaengig manuell ueberschreibbar (siehe DanielsManualPaces) -
// Zonengrenzen werden deshalb nicht mehr aus festen %vVO2max-Mittelpunkten
// abgeleitet, sondern aus den tatsaechlich wirksamen (manuellen oder
// berechneten) Nachbarwerten in Sekunden/km, damit die Bereiche auch bei
// teilweise manuellen Zonen konsistent bleiben.
export function computeDanielsZones(
  user: DanielsInput,
  manual?: DanielsManualPaces | null,
  manualBounds?: DanielsManualBounds | null
): { vdot: number | null; rows: DanielsZoneRow[] } {
  const vdot = bestVdot(user);
  const vVo2maxVelocity = vdot !== null ? velocityAtVdot(vdot) : null;

  const effective = ZONES.map((z) => {
    const bounds = manualBounds?.[z.zone as keyof DanielsManualBounds];
    if (bounds?.min != null && bounds?.max != null) {
      // Trainer hat die Zone direkt ueber ihre beiden Grenzen gesetzt -
      // Mittelwert dient nur als repraesentativer Einzelwert fuer andere
      // Ableitungen (z.B. lib/paceZones.ts:deriveZonePace), die Grenzen
      // selbst kommen unten direkt aus bounds statt aus der
      // Nachbar-Naeherung.
      return { sec: (bounds.min + bounds.max) / 2, isManual: true, bounds };
    }
    const manualValue = manual?.[z.zone as keyof DanielsManualPaces];
    if (manualValue != null) return { sec: manualValue, isManual: true, bounds: null };
    const sec = vVo2maxVelocity !== null ? paceSecPerKm(vVo2maxVelocity * z.pctVvo2max) : null;
    return { sec, isManual: false, bounds: null };
  });

  const rows = ZONES.map((z, i) => {
    const { sec, isManual, bounds } = effective[i];
    if (sec === null) {
      return {
        zone: z.zone,
        paceSecPerKm: null,
        paceRange: "-",
        isManual,
        rangeMinSecPerKm: null,
        rangeMaxSecPerKm: null,
      };
    }

    if (bounds?.min != null && bounds?.max != null) {
      return {
        zone: z.zone,
        paceSecPerKm: sec,
        paceRange: `${formatPace(bounds.min)} – ${formatPace(bounds.max)}`,
        isManual,
        rangeMinSecPerKm: bounds.min,
        rangeMaxSecPerKm: bounds.max,
      };
    }

    // Schnellerer Nachbar -> kleinerer Pace-Wert (obere Grenze); langsamerer
    // Nachbar -> groesserer Pace-Wert (untere Grenze). Jeweils offen (kein
    // Nachbar oder Nachbar ohne Wert) an den Raendern (Easy/Repetition).
    const fasterNeighbor = effective[i + 1]?.sec ?? null;
    const slowerNeighbor = effective[i - 1]?.sec ?? null;
    const fastBound = fasterNeighbor !== null ? (sec + fasterNeighbor) / 2 : null;
    const slowBound = slowerNeighbor !== null ? (sec + slowerNeighbor) / 2 : null;

    let paceRange: string;
    if (fastBound !== null && slowBound !== null) {
      paceRange = `${formatPace(fastBound)} – ${formatPace(slowBound)}`;
    } else if (slowBound !== null) {
      paceRange = `schneller als ${formatPace(slowBound)}`;
    } else if (fastBound !== null) {
      paceRange = `langsamer als ${formatPace(fastBound)}`;
    } else {
      paceRange = formatPace(sec);
    }

    return {
      zone: z.zone,
      paceSecPerKm: sec,
      paceRange,
      isManual,
      rangeMinSecPerKm: fastBound,
      rangeMaxSecPerKm: slowBound,
    };
  });

  return { vdot, rows };
}
