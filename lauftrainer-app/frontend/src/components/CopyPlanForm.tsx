"use client";

import { useState } from "react";

import { ApiError, createPlannedSession, deletePlannedSession, getTrainingPlan } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { addDays, daysBetween, formatRangeLabel, mondayOf, todayLocalIso } from "@/lib/plan";
import { remapSessionPacesToZones } from "@/lib/paceZones";
import type { AthleteSummary } from "@/types/training";

// Label einer ganzen Woche als "dd/mm–dd/mm (KW n)" statt eines einzelnen
// Datums - macht in der Wochenauswahl unmittelbar sichtbar, welche
// Kalenderwoche gewaehlt ist. formatRangeLabel haengt die Kalenderwoche
// bereits selbst an (siehe lib/plan.ts) und erwartet ein exklusives Ende
// (siehe WeekMonthNav.tsx).
function weekLabel(weekStart: string): string {
  return formatRangeLabel("week", weekStart, addDays(weekStart, 7));
}

// Wochen-Stepper statt freiem Datumsfeld: kopiert werden duerfen nur ganze
// Kalenderwochen (Montag-Sonntag), daher wird hier direkt der Wochenanfang
// (immer ein Montag, siehe mondayOf) in 7-Tage-Schritten veraendert statt
// ein beliebiges Datum zuzulassen.
function WeekStepper({ label, weekStart, onChange }: { label: string; weekStart: string; onChange: (weekStart: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-1 rounded-lg border border-mist/20 px-1 py-1">
        <button
          type="button"
          onClick={() => onChange(addDays(weekStart, -7))}
          aria-label="Vorherige Woche"
          className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
        >
          ◀
        </button>
        <span className="flex-1 text-center text-sm text-ink">{weekLabel(weekStart)}</span>
        <button
          type="button"
          onClick={() => onChange(addDays(weekStart, 7))}
          aria-label="Nächste Woche"
          className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

export function CopyPlanForm({
  targetAthleteId,
  athletes,
  onChanged,
}: {
  targetAthleteId: number;
  athletes: AthleteSummary[];
  onChanged: () => void;
}) {
  const { token } = useAuth();

  const [sourceAthleteId, setSourceAthleteId] = useState(targetAthleteId);
  const [sourceFromWeek, setSourceFromWeek] = useState(() => mondayOf(addDays(todayLocalIso(), -7)));
  const [sourceToWeek, setSourceToWeek] = useState(() => mondayOf(addDays(todayLocalIso(), -7)));
  const [targetWeek, setTargetWeek] = useState(() => mondayOf(todayLocalIso()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sourceStart = sourceFromWeek;
  const sourceEnd = addDays(sourceToWeek, 6);
  const targetStart = targetWeek;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (sourceToWeek < sourceFromWeek) {
      setError("Die letzte Quellwoche muss nach der ersten liegen.");
      return;
    }
    if (
      !window.confirm(
        "Bereits geplante Einheiten im Zielzeitraum werden dabei gelöscht und durch die kopierten Einheiten ersetzt. Fortfahren?"
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const sourceSessions = await getTrainingPlan(sourceAthleteId, token);
      const rangeSessions = sourceSessions.filter((s) => s.day >= sourceStart && s.day <= sourceEnd);

      if (rangeSessions.length === 0) {
        setError("Keine Einheiten im Quellzeitraum gefunden.");
        return;
      }

      const targetEnd = addDays(targetStart, daysBetween(sourceStart, sourceEnd));

      // Bestehende Einheiten des Zielzeitraums vorher entfernen, statt die
      // kopierten Einheiten daneben anzulegen - sonst haette der
      // Zielzeitraum nach dem Kopieren doppelte/widerspruechliche Eintraege.
      const targetSessions =
        targetAthleteId === sourceAthleteId
          ? sourceSessions
          : await getTrainingPlan(targetAthleteId, token);
      const existingInTargetRange = targetSessions.filter((s) => s.day >= targetStart && s.day <= targetEnd);
      await Promise.all(existingInTargetRange.map((s) => deletePlannedSession(s.id, token)));

      // Tempovorgaben (Zielpace + Segment-Paces) auf die Trainingsbereiche
      // des Zielathleten umrechnen statt die Paces des Quellathleten
      // unveraendert zu uebernehmen - sonst liefe der Zielathlet ggf. mit
      // einer fuer ihn falschen (z.B. viel zu schnellen) Vorgabe. Ohne
      // gefundene Zonen des Zielathleten (sollte praktisch nicht vorkommen,
      // da `athletes` die volle Trainer-Athletenliste ist) bleiben die
      // Paces unveraendert.
      const targetAthlete = athletes.find((a) => a.id === targetAthleteId);

      await Promise.all(
        rangeSessions.map((s) => {
          const remapped = targetAthlete ? remapSessionPacesToZones(s, targetAthlete) : s;
          return createPlannedSession(
            targetAthleteId,
            {
              day: addDays(targetStart, daysBetween(sourceStart, s.day)),
              title: s.title,
              description: s.description,
              target_zone: s.target_zone,
              method: s.method,
              target_distance_km: s.target_distance_km,
              target_duration_s: s.target_duration_s,
              target_pace: remapped.target_pace ?? s.target_pace,
              segments: remapped.segments ?? s.segments,
            },
            token
          );
        })
      );
      setSuccess(
        `${rangeSessions.length} Einheit(en) übernommen` +
          (existingInTargetRange.length > 0 ? ` (${existingInTargetRange.length} bestehende ersetzt).` : ".")
      );
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zeitraum konnte nicht kopiert werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <h3 className="text-sm font-medium text-ink">Trainingsplan kopieren</h3>
      <p className="text-xs text-mist">
        Übernimmt alle Einheiten ganzer Kalenderwochen (vom selben oder einem anderen Athleten) in einen Zielzeitraum
        gleicher Länge, beginnend bei der gewählten Zielwoche - die relative Lage der Tage zueinander bleibt dabei
        erhalten. Bereits geplante Einheiten im Zielzeitraum werden dabei gelöscht und ersetzt.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div>
          <label className="label">Von Athlet</label>
          <select
            className="input"
            value={sourceAthleteId}
            onChange={(e) => setSourceAthleteId(Number(e.target.value))}
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <WeekStepper label="Quellwoche von" weekStart={sourceFromWeek} onChange={setSourceFromWeek} />
        <WeekStepper label="Quellwoche bis" weekStart={sourceToWeek} onChange={setSourceToWeek} />
        <WeekStepper label="Zielwoche ab" weekStart={targetWeek} onChange={setTargetWeek} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && !error && <p className="text-sm text-moss">{success}</p>}

      <button type="submit" disabled={submitting} className="btn-outline">
        Zeitraum kopieren
      </button>
    </form>
  );
}
