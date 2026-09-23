"use client";

import { useState } from "react";

import {
  buildPlanSessionPayload,
  emptyPlanSessionValue,
  PlanSessionFields,
  type PlanSessionValue,
} from "@/components/PlanSessionFields";
import { ApiError, createPlannedSession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyDerivedPaces, deriveZonePace } from "@/lib/paceZones";
import { todayLocalIso } from "@/lib/plan";
import type { AthleteSummary, PlanSegment } from "@/types/training";

// Legt dieselbe Einheit (Titel/Zielzone/Distanz-oder-Dauer/Segmente) fuer
// mehrere Athleten gleichzeitig an - das individuelle Tempo bleibt dabei
// erhalten: die Pace-Felder werden bewusst NICHT im gemeinsamen Formular
// gesetzt (kein athleteZones-Prop), sondern erst beim Absenden pro Athlet
// aus dessen eigenen Zonen abgeleitet (deriveZonePace/applyDerivedPaces,
// siehe lib/paceZones.ts - dieselben Funktionen, die PlanSessionFields
// auch fuer die Einzel-Athlet-Planung nutzt).
export function MultiAthletePlanForm({
  athletes,
  onChanged,
}: {
  athletes: AthleteSummary[];
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [value, setValue] = useState(() => emptyPlanSessionValue(todayLocalIso()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function toggleAthlete(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function patch(p: Partial<PlanSessionValue>) {
    setValue({ ...value, ...p });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (selectedIds.length < 1) {
      setError("Bitte mindestens einen Athleten auswählen.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const basePayload = buildPlanSessionPayload(value);
      await Promise.all(
        selectedIds.map((athleteId) => {
          const athlete = athletes.find((a) => a.id === athleteId);
          let segments: PlanSegment[] = basePayload.segments ?? [];
          let target_pace = basePayload.target_pace ?? "";
          if (athlete) {
            if (segments.length > 0) {
              segments = applyDerivedPaces(segments, athlete);
            } else if (basePayload.target_zone && !target_pace) {
              target_pace = deriveZonePace(basePayload.target_zone, athlete) ?? "";
            }
          }
          return createPlannedSession(athleteId, { ...basePayload, segments, target_pace }, token);
        })
      );
      setSuccess(`Einheit für ${selectedIds.length} Athleten angelegt.`);
      setValue(emptyPlanSessionValue(todayLocalIso()));
      setSelectedIds([]);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Einheit konnte nicht für alle Athleten angelegt werden");
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
        + Einheit für mehrere Athleten planen
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Einheit für mehrere Athleten planen</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-mist transition-colors hover:text-ink">
          Abbrechen
        </button>
      </div>
      <p className="text-xs text-mist">
        Titel, Zielzone und Distanz/Dauer gelten für alle ausgewählten Athleten gleich - das Ziel-Tempo wird beim
        Anlegen automatisch aus den individuellen Zonen jedes Athleten abgeleitet.
      </p>

      <div>
        <label className="label">Athleten</label>
        <div className="flex flex-wrap gap-2">
          {athletes.map((a) => (
            <label
              key={a.id}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                selectedIds.includes(a.id) ? "border-moss bg-moss/10 text-ink" : "border-mist/20 text-mist"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(a.id)}
                onChange={() => toggleAthlete(a.id)}
                className="accent-moss"
              />
              {a.name}
            </label>
          ))}
        </div>
      </div>

      <PlanSessionFields value={value} onChange={patch} athleteZones={null} showDay showTargetPace={false} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && !error && <p className="text-sm text-moss">{success}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        Für {selectedIds.length || "…"} Athleten anlegen
      </button>
    </form>
  );
}
