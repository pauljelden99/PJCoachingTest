"use client";

import { useState } from "react";

import { formatDuration } from "@/lib/format";
import { ApiError, createManualActivity } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  computeActualDurationS,
  CYCLING_ZONES,
  formatDateDMY,
  segmentsTotalKm,
  segmentsVisibleForZone,
  shortWeekdayLabel,
  todayLocalIso,
  zoneUsesDuration,
} from "@/lib/plan";
import {
  buildPlanSessionPayload,
  emptyPlanSessionValue,
  planSessionValueFromSession,
  PlanSessionFields,
} from "@/components/PlanSessionFields";
import { reclassifyZoneFromActualPace, type SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { PlannedSession } from "@/types/training";

// Die Startzeit wird nicht mehr manuell erfasst (siehe handleSubmit) -
// stattdessen wird fuer den Tag ein neutraler Zeitpunkt (Mittag) gesetzt,
// da start_time in der Datenbank nicht null sein darf, fuer Auswertung/
// Statistik aber nur der Tag (day) relevant ist.
function noonOfDayIso(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

// Nutzt dieselben Formularfelder wie das Planen einer Einheit
// (PlanSessionFields: Titel, Zielzone, Distanz/Dauer/Segmente, Notiz) -
// eine protokollierte Einheit soll genauso funktionieren wie die Planung
// einer Einheit. Bei Athletik/Beweglichkeit liefert PlanSessionFields
// bereits die (dann tatsaechliche) Dauer; bei den lauf-spezifischen Zonen
// braucht die Lastberechnung zusaetzlich die tatsaechlich gelaufene Zeit,
// die dort separat erfasst wird (siehe durationMode unten).
export function ManualActivityForm({
  athleteId,
  athleteZones = null,
  athleteWattZones = null,
  plannedSessions = [],
  onLogged,
  day,
  onCancel,
}: {
  athleteId?: number;
  athleteZones?: SegmentZoneInput | null;
  athleteWattZones?: WattZoneInput | null;
  // Geplante Einheiten des Athleten (ueblicherweise die ganze Liste, nicht
  // nur der sichtbare Zeitraum, da der Tag im Formular frei geaendert
  // werden kann) - fuer "Aus geplanter Einheit uebernehmen" unten.
  plannedSessions?: PlannedSession[];
  onLogged: () => void;
  // Fester Tag statt freier Tageswahl - wird gesetzt, wenn das Formular aus
  // einem Tages-Kasten heraus geoeffnet wurde (siehe ManualActivityDayBoxes),
  // die dann auch das Auf-/Zuklappen uebernimmt (siehe onCancel/close unten)
  // statt des internen "+"-Buttons.
  day?: string;
  onCancel?: () => void;
}) {
  const { token } = useAuth();

  const [value, setValue] = useState(emptyPlanSessionValue(day ?? todayLocalIso()));
  const [actualPace, setActualPace] = useState("");
  // Fallback fuer Einheiten ganz ohne Distanz (z.B. Laufband ohne GPS) -
  // dort laesst sich keine Gesamtzeit aus Distanz+Tempo ableiten, siehe
  // hasDistance unten.
  const [actualDurationMin, setActualDurationMin] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [elevationGain, setElevationGain] = useState("");
  const [rpe, setRpe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(day != null);

  function close() {
    if (day != null) onCancel?.();
    else setOpen(false);
  }

  const durationMode = zoneUsesDuration(value.target_zone);
  const segmentsVisible = segmentsVisibleForZone(value.target_zone);
  const isCycling = CYCLING_ZONES.includes(value.target_zone);
  const distanceKm = segmentsVisible ? segmentsTotalKm(value.segments) : Number(value.target_distance_km) || 0;
  const hasDistance = distanceKm > 0;
  // Gesamtzeit wird automatisch aus Distanz und Tempo berechnet statt
  // manuell eingegeben - siehe computeActualDurationS. Ohne jede Distanz
  // (hasDistance false) bleibt die manuelle Dauereingabe die einzige
  // Option, da dann kein Tempo abgeleitet werden kann.
  const computedDurationS =
    !durationMode && hasDistance
      ? computeActualDurationS(value.target_zone, value.target_distance_km, value.segments, actualPace)
      : null;

  function patch(p: Partial<typeof value>) {
    setValue({ ...value, ...p });
  }

  // Geplante Einheiten desselben Tages - erlaubt, eine bereits geplante
  // Einheit als Ausgangspunkt fuer die Protokollierung zu uebernehmen,
  // statt Titel/Zielzone/Distanz/Segmente erneut von Hand einzutippen.
  const sessionsSameDay = plannedSessions.filter((s) => s.day === value.day);

  function takeOverFromPlan(session: PlannedSession) {
    setValue(planSessionValueFromSession(session));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (!durationMode && hasDistance && computedDurationS == null) {
      setError(
        segmentsVisible
          ? "Für jedes Segment wird entweder eine Dauer oder eine Distanz mit Tempo benötigt, um die Gesamtzeit zu berechnen."
          : "Bitte ein gültiges Tempo (mm:ss) angeben, um die Gesamtzeit zu berechnen."
      );
      return;
    }
    setSubmitting(true);
    try {
      const planPayload = buildPlanSessionPayload(value);
      const durationS = durationMode
        ? (planPayload.target_duration_s ?? 0)
        : hasDistance
          ? (computedDurationS ?? 0)
          : Number(actualDurationMin) * 60;
      await createManualActivity(
        {
          day: planPayload.day,
          start_time: noonOfDayIso(planPayload.day),
          duration_s: durationS,
          distance_m: planPayload.target_distance_km != null ? planPayload.target_distance_km * 1000 : null,
          avg_hr: avgHr ? Number(avgHr) : null,
          elevation_gain_m: elevationGain ? Number(elevationGain) : null,
          rpe: rpe ? Number(rpe) : null,
          athlete_id: athleteId,
          title: planPayload.title,
          description: planPayload.description,
          target_zone: planPayload.target_zone,
          method: planPayload.method,
          segments: planPayload.segments,
        },
        token
      );
      setValue(emptyPlanSessionValue(day ?? todayLocalIso()));
      setActualPace("");
      setActualDurationMin("");
      setAvgHr("");
      setElevationGain("");
      setRpe("");
      close();
      onLogged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Eintrag konnte nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-mist/30 bg-surface/50 p-4 text-sm text-mist transition-colors hover:border-moss hover:text-moss"
      >
        + Training manuell erfassen
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-ink">
          {day ? `Training erfassen – ${shortWeekdayLabel(day)} ${formatDateDMY(day)}` : "Training manuell erfassen"}
        </h2>
        <button type="button" onClick={close} className="text-sm text-mist transition-colors hover:text-ink">
          Abbrechen
        </button>
      </div>

      {sessionsSameDay.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-moss/20 bg-moss/5 px-3 py-2 text-xs">
          <span className="text-mist">Geplant für diesen Tag:</span>
          {sessionsSameDay.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => takeOverFromPlan(s)}
              className="link-action font-medium"
            >
              {s.title || s.target_zone || "Einheit"} übernehmen
            </button>
          ))}
        </div>
      )}

      <PlanSessionFields
        value={value}
        onChange={patch}
        athleteZones={athleteZones}
        athleteWattZones={athleteWattZones}
        showDay={day == null}
        showTargetPace={false}
        mode="log"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!durationMode && hasDistance && !segmentsVisible && (
          <div>
            <label className="label">Tempo (mm:ss/km)</label>
            <input
              type="text"
              placeholder="4:30"
              className="input"
              value={actualPace}
              onChange={(e) => {
                const pace = e.target.value;
                setActualPace(pace);
                // Die tatsaechlich eingegebene Pace kann von der bisher
                // gewaehlten Zielzone abweichen (z.B. ein als "GA1"
                // begonnener Lauf, der tatsaechlich Schwellentempo war) -
                // die Zone dann automatisch an die Pace-Tabelle anpassen
                // (siehe reclassifyZoneFromActualPace).
                const reclassified = reclassifyZoneFromActualPace(value.target_zone, pace, distanceKm, athleteZones);
                if (reclassified) patch(reclassified);
              }}
              required
            />
          </div>
        )}
        {!durationMode && hasDistance && (
          <div>
            <label className="label">Gesamtzeit</label>
            <p className="input flex items-center bg-mist/5 text-mist">
              {computedDurationS != null ? formatDuration(computedDurationS) : "–"}
            </p>
          </div>
        )}
        {!durationMode && !hasDistance && (
          <div>
            <label className="label">Tatsächliche Dauer (Minuten)</label>
            <input
              type="number"
              min={1}
              step="0.1"
              className="input"
              value={actualDurationMin}
              onChange={(e) => setActualDurationMin(e.target.value)}
              required
            />
          </div>
        )}
        {hasDistance && (
          <div>
            <label className="label">Höhenmeter (optional)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={elevationGain}
              onChange={(e) => setElevationGain(e.target.value)}
              placeholder="Anstieg in m"
            />
            {!isCycling && (
              <p className="mt-1 text-xs text-mist">
                Fließt über die Grade Adjusted Pace in die Trainingslast ein.
              </p>
            )}
          </div>
        )}
        <div>
          <label className="label">Puls (optional)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={avgHr}
            onChange={(e) => setAvgHr(e.target.value)}
            placeholder="Durchschnitt bpm"
          />
        </div>
        <div>
          <label className="label">RPE 0-10</label>
          <input
            type="number"
            min={0}
            max={10}
            step="0.5"
            className="input"
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
            placeholder="Empfundene Anstrengung"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        Training speichern
      </button>
    </form>
  );
}
