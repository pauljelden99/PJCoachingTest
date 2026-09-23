"use client";

import { useState } from "react";

import { buildPlanSessionPayload, PlanSessionFields, type PlanSessionValue } from "@/components/PlanSessionFields";
import { ApiError, updateActivity } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/format";
import { formatPaceValue } from "@/lib/pace";
import {
  computeActualDurationS,
  methodOptionsForZone,
  segmentsTotalKm,
  segmentsVisibleForZone,
  zoneUsesDuration,
} from "@/lib/plan";
import { reclassifyZoneFromActualPace, type SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { Activity } from "@/types/training";

interface EditForm {
  actualPace: string;
  // Fallback fuer Einheiten ganz ohne Distanz (z.B. Laufband ohne GPS) -
  // dort laesst sich keine Gesamtzeit aus Distanz+Tempo ableiten.
  actualDurationMin: string;
  avgHr: string;
  elevationGain: string;
  rpe: string;
  plan: PlanSessionValue;
}

// Dieselben Planungsfelder wie beim Bearbeiten einer geplanten Einheit
// (siehe PlanEditor.tsx) - eine protokollierte Einheit soll genauso
// funktionieren wie die Planung einer Einheit. Bei Athletik/Beweglichkeit
// liefert PlanSessionFields bereits die tatsaechliche Dauer; bei den
// lauf-spezifischen Zonen wird sie separat erfasst (siehe durationMode
// im Formular unten), da die Lastberechnung immer die tatsaechlich
// gelaufene Zeit braucht, waehrend eine Distanzzone im Planungsformular
// nur die Distanz zeigt.
function toForm(a: Activity): EditForm {
  const durationMode = zoneUsesDuration(a.target_zone);
  const segmentsVisible = segmentsVisibleForZone(a.target_zone);
  const distanceKm = a.distance_m != null ? a.distance_m / 1000 : 0;
  // Fuer nicht-strukturierte Einheiten (GA1/ohne Zielzone) das Tempo aus
  // der bereits gespeicherten Dauer/Distanz zurueckrechnen, damit die
  // Gesamtzeit beim Bearbeiten sofort wieder konsistent berechnet wird
  // (siehe segmentsTotalDurationS fuer die strukturierten Zonen).
  const hasDistance = segmentsVisible ? segmentsTotalKm(a.segments) > 0 : distanceKm > 0;
  const actualPace =
    !durationMode && !segmentsVisible && hasDistance ? formatPaceValue(a.duration_s / distanceKm) : "";
  return {
    actualPace,
    actualDurationMin: !durationMode && !hasDistance ? (a.duration_s / 60).toString() : "",
    avgHr: a.avg_hr !== null ? Math.round(a.avg_hr).toString() : "",
    elevationGain: a.elevation_gain_m !== null ? Math.round(a.elevation_gain_m).toString() : "",
    rpe: a.rpe !== null ? a.rpe.toString() : "",
    plan: {
      day: a.day,
      title: a.title,
      description: a.description,
      target_zone: a.target_zone ?? "",
      // Siehe PlanSessionFields.tsx:planSessionValueFromSession - bestehende
      // Aktivitaeten ohne Methodik gelten implizit als "Intervalle".
      method: a.method ?? (methodOptionsForZone(a.target_zone)[0] ?? ""),
      target_distance_km: a.distance_m != null ? (a.distance_m / 1000).toString() : "",
      target_duration_min: durationMode ? (a.duration_s / 60).toString() : "",
      target_pace: "",
      segments: a.segments,
    },
  };
}

// Bearbeitungsformular fuer eine einzelne protokollierte Aktivitaet -
// aus ActivityList.tsx herausgeloest, damit dieselbe Bearbeiten-Logik auch
// von PlanProtokollDayRows.tsx (Tageszeilen-Ansicht) genutzt werden kann,
// ohne die Berechnung von Gesamtzeit/Tempo/Segmenten zu duplizieren.
export function ActivityEditForm({
  activity,
  athleteZones = null,
  athleteWattZones = null,
  onSaved,
  onCancel,
}: {
  activity: Activity;
  athleteZones?: SegmentZoneInput | null;
  athleteWattZones?: WattZoneInput | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<EditForm>(() => toForm(activity));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const durationMode = zoneUsesDuration(form.plan.target_zone);
    const segmentsVisible = segmentsVisibleForZone(form.plan.target_zone);
    const distanceKm = segmentsVisible ? segmentsTotalKm(form.plan.segments) : Number(form.plan.target_distance_km) || 0;
    const hasDistance = distanceKm > 0;
    const computedDurationS =
      !durationMode && hasDistance
        ? computeActualDurationS(form.plan.target_zone, form.plan.target_distance_km, form.plan.segments, form.actualPace)
        : null;
    if (!durationMode && hasDistance && computedDurationS == null) {
      setError(
        segmentsVisible
          ? "Für jedes Segment wird entweder eine Dauer oder eine Distanz mit Tempo benötigt, um die Gesamtzeit zu berechnen."
          : "Bitte ein gültiges Tempo (mm:ss) angeben, um die Gesamtzeit zu berechnen."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const planPayload = buildPlanSessionPayload(form.plan);
      const durationS = durationMode
        ? (planPayload.target_duration_s ?? 0)
        : hasDistance
          ? (computedDurationS ?? 0)
          : Number(form.actualDurationMin) * 60;
      await updateActivity(
        activity.id,
        {
          day: planPayload.day,
          duration_s: durationS,
          distance_m: planPayload.target_distance_km != null ? planPayload.target_distance_km * 1000 : null,
          avg_hr: form.avgHr ? Number(form.avgHr) : null,
          elevation_gain_m: form.elevationGain ? Number(form.elevationGain) : null,
          rpe: form.rpe ? Number(form.rpe) : null,
          title: planPayload.title,
          description: planPayload.description,
          target_zone: planPayload.target_zone,
          method: planPayload.method,
          segments: planPayload.segments,
        },
        token
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Änderung konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  const durationMode = zoneUsesDuration(form.plan.target_zone);
  const segmentsVisible = segmentsVisibleForZone(form.plan.target_zone);
  const distanceKm = segmentsVisible ? segmentsTotalKm(form.plan.segments) : Number(form.plan.target_distance_km) || 0;
  const hasDistance = distanceKm > 0;
  const durationS = computeActualDurationS(form.plan.target_zone, form.plan.target_distance_km, form.plan.segments, form.actualPace);

  return (
    <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-mist/15 bg-paper p-3">
      <h3 className="text-sm font-medium text-ink">Aktivität bearbeiten</h3>

      <PlanSessionFields
        value={form.plan}
        onChange={(patch) => setForm({ ...form, plan: { ...form.plan, ...patch } })}
        athleteZones={athleteZones}
        athleteWattZones={athleteWattZones}
        showTargetPace={false}
        mode="log"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!durationMode &&
          (!hasDistance ? (
            <div>
              <label className="label">Tatsächliche Dauer (Minuten)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                className="input"
                value={form.actualDurationMin}
                onChange={(e) => setForm({ ...form, actualDurationMin: e.target.value })}
                required
              />
            </div>
          ) : (
            <>
              {!segmentsVisible && (
                <div>
                  <label className="label">Tempo (mm:ss/km)</label>
                  <input
                    type="text"
                    placeholder="4:30"
                    className="input"
                    value={form.actualPace}
                    onChange={(e) => {
                      const pace = e.target.value;
                      // Die tatsaechlich eingegebene Pace kann von der
                      // bisher gewaehlten Zielzone abweichen - die Zone dann
                      // automatisch an die Pace-Tabelle anpassen (siehe
                      // reclassifyZoneFromActualPace).
                      const reclassified = reclassifyZoneFromActualPace(
                        form.plan.target_zone,
                        pace,
                        distanceKm,
                        athleteZones
                      );
                      setForm({
                        ...form,
                        actualPace: pace,
                        plan: reclassified ? { ...form.plan, ...reclassified } : form.plan,
                      });
                    }}
                    required
                  />
                </div>
              )}
              <div>
                <label className="label">Gesamtzeit</label>
                <p className="input flex items-center bg-mist/5 text-mist">
                  {durationS != null ? formatDuration(durationS) : "–"}
                </p>
              </div>
            </>
          ))}
        {hasDistance && (
          <div>
            <label className="label">Höhenmeter (optional)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={form.elevationGain}
              onChange={(e) => setForm({ ...form, elevationGain: e.target.value })}
              placeholder="Anstieg in m"
            />
          </div>
        )}
        <div>
          <label className="label">Puls (optional)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={form.avgHr}
            onChange={(e) => setForm({ ...form, avgHr: e.target.value })}
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
            value={form.rpe}
            onChange={(e) => setForm({ ...form, rpe: e.target.value })}
            placeholder="Empfundene Anstrengung"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          Speichern
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-mist transition-colors hover:text-ink">
          Abbrechen
        </button>
      </div>
    </form>
  );
}
