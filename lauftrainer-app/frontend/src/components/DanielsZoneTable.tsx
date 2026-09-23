"use client";

import { useState } from "react";

import { ApiError, updateAthleteProfile, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { computeDanielsZones, type DanielsManualBounds } from "@/lib/danielsZones";
import { computeHrZones } from "@/lib/hrZones";
import { formatPaceValue, parsePaceValue } from "@/lib/pace";
import type { User, UserProfileUpdate } from "@/types/training";

const ZONE_HINTS: Record<string, string> = {
  Easy: "Grundlagenausdauer, lockere Läufe",
  Marathon: "Marathon-Renntempo",
  Threshold: "Schwellentempo (Tempolauf, Cruise Intervals)",
  Interval: "VO2max-Intervalle (3-5 min)",
  Repetition: "Lauftechnik/Schnelligkeit (kurze Reps)",
};

// Naeherungsweise Entsprechung zwischen den 5 Daniels-Trainingsbereichen
// und dem 5-Zonen-HF-Modell (Karvonen, siehe lib/hrZones.ts) - Pace und
// Puls werden unabhaengig gemessen, es gibt dafuer keine Formel im Code.
// Gaengige Faustregel aus der Trainingslehre, keine exakte Ableitung.
const HR_ZONE_BY_DANIELS: Record<string, string> = {
  Easy: "Z2 Grundlage",
  Marathon: "Z3 Entwicklung",
  Threshold: "Z4 Schwelle",
  Interval: "Z5 Maximal",
  Repetition: "Z5 Maximal",
};

// Zone -> zugehoeriges User-/UserProfileUpdate-Feld. Threshold/Interval
// nutzen dieselben Felder wie die 3-Zonen-Klassifizierung (GA1/Schwelle/
// VO2max, siehe lib/paceZones.ts), da beide Zonenmodelle dort
// uebereinstimmen - siehe models/user.py:User fuer die Begruendung.
const ZONE_ORDER = ["Easy", "Marathon", "Threshold", "Interval", "Repetition"] as const;
type DanielsZoneKey = (typeof ZONE_ORDER)[number];
// Repraesentativer Mittelwert je Zone (Mittelwert aus min/max beim
// Speichern, siehe handleSave) - weiterhin gepflegt, da andere Ableitungen
// (lib/paceZones.ts:deriveZonePace) einen einzelnen Wert je Zone erwarten.
const ZONE_FIELD: Record<DanielsZoneKey, keyof UserProfileUpdate & keyof User> = {
  Easy: "easy_pace_sec_per_km",
  Marathon: "marathon_pace_sec_per_km",
  Threshold: "threshold_pace_sec_per_km",
  Interval: "vo2max_pace_sec_per_km",
  Repetition: "repetition_pace_sec_per_km",
};
// Die vom Trainer direkt gesetzte obere/untere Grenze je Zone (siehe
// lib/danielsZones.ts:DanielsManualBounds) - ersetzt seit der Einfuehrung
// der Zwei-Grenzen-Eingabe den vorherigen Einzelwert-Input dieser Tabelle.
const ZONE_MIN_FIELD: Record<DanielsZoneKey, keyof UserProfileUpdate & keyof User> = {
  Easy: "easy_pace_min_sec_per_km",
  Marathon: "marathon_pace_min_sec_per_km",
  Threshold: "threshold_pace_min_sec_per_km",
  Interval: "vo2max_pace_min_sec_per_km",
  Repetition: "repetition_pace_min_sec_per_km",
};
const ZONE_MAX_FIELD: Record<DanielsZoneKey, keyof UserProfileUpdate & keyof User> = {
  Easy: "easy_pace_max_sec_per_km",
  Marathon: "marathon_pace_max_sec_per_km",
  Threshold: "threshold_pace_max_sec_per_km",
  Interval: "vo2max_pace_max_sec_per_km",
  Repetition: "repetition_pace_max_sec_per_km",
};

interface BoundInputs {
  min: string;
  max: string;
}

function emptyBoundInputs(user: User): Record<DanielsZoneKey, BoundInputs> {
  const result = {} as Record<DanielsZoneKey, BoundInputs>;
  for (const zone of ZONE_ORDER) {
    const min = user[ZONE_MIN_FIELD[zone]] as number | null;
    const max = user[ZONE_MAX_FIELD[zone]] as number | null;
    result[zone] = { min: min != null ? formatPaceValue(min) : "", max: max != null ? formatPaceValue(max) : "" };
  }
  return result;
}

// Trainingsbereichtabelle nach Jack Daniels: standardmaessig aus der besten
// hinterlegten Wettkampfzeit (VDOT) berechnet, im Trainer-Editiermodus
// (`editable`) direkt in dieser Tabelle manuell ueberschreibbar - jede der
// fuenf Zonen einzeln, unabhaengig von den anderen (siehe
// lib/danielsZones.ts:computeDanielsZones). Eine leer gelassene Zone faellt
// automatisch auf den berechneten Wert zurueck.
export function DanielsZoneTable({
  user,
  editable = false,
  athleteId,
  onSaved,
}: {
  user: User;
  editable?: boolean;
  athleteId?: number;
  onSaved?: (user: User) => void;
}) {
  const { token, setUser } = useAuth();
  const [paceZonesManual, setPaceZonesManual] = useState(user.pace_zones_manual);
  const [boundInputs, setBoundInputs] = useState<Record<DanielsZoneKey, BoundInputs>>(() => emptyBoundInputs(user));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const manualBounds: DanielsManualBounds | null = paceZonesManual
    ? Object.fromEntries(
        ZONE_ORDER.map((zone) => [
          zone,
          { min: parsePaceValue(boundInputs[zone].min), max: parsePaceValue(boundInputs[zone].max) },
        ])
      )
    : null;

  const { vdot, rows } = computeDanielsZones(user, null, manualBounds);
  // Rein berechnete Werte (ohne manuelle Ueberschreibung) als Platzhalter in
  // den Eingabefeldern, damit sichtbar bleibt, worauf eine leer gelassene
  // Zone zurueckfaellt.
  const computedRows = computeDanielsZones(user, null).rows;
  const hrRows = computeHrZones(user);

  function setBoundInput(zone: DanielsZoneKey, bound: keyof BoundInputs, value: string) {
    setBoundInputs((prev) => ({ ...prev, [zone]: { ...prev[zone], [bound]: value } }));
  }

  async function handleSave() {
    if (!token) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const zonePayload: Record<string, number | null> = {};
      for (const zone of ZONE_ORDER) {
        const min = parsePaceValue(boundInputs[zone].min);
        const max = parsePaceValue(boundInputs[zone].max);
        const bothSet = min != null && max != null;
        zonePayload[ZONE_MIN_FIELD[zone]] = bothSet ? min : null;
        zonePayload[ZONE_MAX_FIELD[zone]] = bothSet ? max : null;
        zonePayload[ZONE_FIELD[zone]] = bothSet ? (min + max) / 2 : null;
      }
      const payload: UserProfileUpdate = {
        pace_zones_manual: paceZonesManual,
        ...(paceZonesManual ? zonePayload : {}),
      };
      const updated = athleteId
        ? await updateAthleteProfile(athleteId, payload, token)
        : await updateProfile(payload, token);
      if (!athleteId) setUser(updated);
      onSaved?.(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Trainingsbereiche konnten nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-ink">Trainingsbereiche (Jack Daniels)</h2>
        {vdot !== null && <span className="text-xs text-mist">VDOT {vdot.toFixed(1)}</span>}
      </div>
      <p className="mt-1 text-xs text-mist">
        Pacezone berechnet aus der schnellsten hinterlegten Wettkampfzeit über die Daniels-Gilbert-VDOT-Formel.
        Daniels, J. &amp; Gilbert, J. (1979): &bdquo;Oxygen Power: Performance Tables for Distance Runners&ldquo;;{" "}
        <a
          href="https://en.wikipedia.org/wiki/Jack_Daniels_(coach)"
          target="_blank"
          rel="noopener noreferrer"
          className="link-action"
        >
          Daniels, J.: &bdquo;Daniels&apos; Running Formula&ldquo;, Human Kinetics
        </a>
        . HF-Bereich als gängige Näherung aus der Herzfrequenzreserve (Karvonen-Methode) - Pace und Puls werden
        unabhängig gemessen, daher keine exakte Entsprechung.
      </p>

      {editable && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="accent-moss"
            checked={paceZonesManual}
            onChange={(e) => setPaceZonesManual(e.target.checked)}
          />
          Trainingsbereiche manuell festlegen (statt automatisch aus der Wettkampfzeit abzuleiten) - je Zone einzeln
          über die schnellere und langsamere Grenze, leer gelassene Zonen bleiben automatisch berechnet
        </label>
      )}

      {rows.every((r) => r.paceSecPerKm === null) && (
        <p className="mt-3 text-xs text-mist">
          Noch keine Wettkampfzeit hinterlegt - trage oben mindestens eine Distanz ein, um die Zonen zu berechnen.
        </p>
      )}
      {vdot !== null && !hrRows && (
        <p className="mt-3 text-xs text-mist">
          Noch kein Ruhe-/Maximalpuls hinterlegt - trage oben beide Werte ein, um den HF-Bereich zu berechnen.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-mist">
              <th className="py-2 font-normal">Zone</th>
              <th className="py-2 font-normal">Pacezone</th>
              <th className="py-2 font-normal">HF-Bereich</th>
              <th className="py-2 font-normal">Einsatz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hrRange = hrRows?.find((h) => h.zone === HR_ZONE_BY_DANIELS[row.zone])?.range;
              const zone = row.zone as DanielsZoneKey;
              const computedRow = computedRows.find((r) => r.zone === row.zone);
              return (
                <tr key={row.zone} className="border-t border-mist/10 transition-colors hover:bg-mist/5">
                  <td className="py-2 text-ink">{row.zone}</td>
                  <td className="py-2">
                    {editable && paceZonesManual ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder={
                            computedRow?.rangeMinSecPerKm != null ? formatPaceValue(computedRow.rangeMinSecPerKm) : "mm:ss"
                          }
                          className="input w-20"
                          value={boundInputs[zone].min}
                          onChange={(e) => setBoundInput(zone, "min", e.target.value)}
                        />
                        <span className="text-mist">–</span>
                        <input
                          type="text"
                          placeholder={
                            computedRow?.rangeMaxSecPerKm != null ? formatPaceValue(computedRow.rangeMaxSecPerKm) : "mm:ss"
                          }
                          className="input w-20"
                          value={boundInputs[zone].max}
                          onChange={(e) => setBoundInput(zone, "max", e.target.value)}
                        />
                      </div>
                    ) : (
                      // Ob eine Zone manuell ueberschrieben wurde, ist nur fuer den
                      // Trainer relevant (siehe editable oben) - der Athlet selbst
                      // soll das nicht sehen (nur der eigene, nicht-editierbare
                      // Ansichtsmodus erreicht diesen Zweig ueberhaupt mit
                      // row.isManual=true, siehe app/profile/page.tsx). Identische
                      // Darstellung (row.paceRange) unabhaengig davon, ob die Zone
                      // manuell (ueber die beiden Grenzen oben) oder automatisch aus
                      // dem VDOT berechnet wurde.
                      row.paceRange
                    )}
                  </td>
                  <td className="py-2">{hrRange ?? "-"}</td>
                  <td className="py-2 text-mist">{ZONE_HINTS[row.zone]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={handleSave} disabled={submitting} className="btn-outline">
            Trainingsbereiche speichern
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
          {saved && !error && <p className="text-sm text-moss">Gespeichert.</p>}
        </div>
      )}
    </div>
  );
}
