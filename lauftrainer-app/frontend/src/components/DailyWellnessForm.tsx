"use client";

import { useState } from "react";

import { ApiError, upsertWellness } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatSleepDuration, parseSleepDuration } from "@/lib/format";
import type { DailyWellness } from "@/types/training";

type Status = "idle" | "saving" | "saved" | "error";

// Immer sichtbares, autospeicherndes Formular (kein Auf-/Zuklappen, kein
// Speichern-Button mehr) - wird von PlanProtokollDayRows als dritte Spalte
// je Tag eingebettet. Jedes Feld speichert einzeln bei onBlur, damit ein
// Blattwechsel zwischen den Feldern (Tab) nicht mehrere Requests mit
// unvollstaendigem Zwischenstand ausloest.
// Der Trainer sieht dieselbe Ansicht schreibgeschuetzt (readOnly): er darf
// die physiologischen Werte seiner Athleten einsehen, aber nicht selbst
// erfassen (siehe PlanProtokollDayRows: wellness.readOnly).
export function DailyWellnessForm({
  athleteId,
  day,
  entry,
  onSaved,
  readOnly = false,
}: {
  athleteId: number;
  day: string;
  entry: DailyWellness | null;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const { token } = useAuth();

  const [restingHr, setRestingHr] = useState(entry?.resting_hr?.toString() ?? "");
  const [hrv, setHrv] = useState(entry?.hrv?.toString() ?? "");
  const [sleepDuration, setSleepDuration] = useState(formatSleepDuration(entry?.sleep_duration_h));
  const [sleepQuality, setSleepQuality] = useState(entry?.sleep_quality?.toString() ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(overrides: {
    restingHr?: string;
    hrv?: string;
    sleepDuration?: string;
    sleepQuality?: string;
  }) {
    if (!token || readOnly) return;
    const values = {
      restingHr: overrides.restingHr ?? restingHr,
      hrv: overrides.hrv ?? hrv,
      sleepDuration: overrides.sleepDuration ?? sleepDuration,
      sleepQuality: overrides.sleepQuality ?? sleepQuality,
    };
    setStatus("saving");
    setError(null);
    try {
      await upsertWellness(
        athleteId,
        day,
        {
          resting_hr: values.restingHr ? Number(values.restingHr) : null,
          hrv: values.hrv ? Number(values.hrv) : null,
          sleep_duration_h: values.sleepDuration ? parseSleepDuration(values.sleepDuration) : null,
          sleep_quality: values.sleepQuality ? Number(values.sleepQuality) : null,
        },
        token
      );
      setStatus("saved");
      onSaved();
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Eintrag konnte nicht gespeichert werden");
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Ruhepuls (bpm)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={restingHr}
            disabled={readOnly}
            onChange={(e) => setRestingHr(e.target.value)}
            onBlur={() => save({ restingHr })}
          />
        </div>
        <div>
          <label className="label">HRV (ms)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={hrv}
            disabled={readOnly}
            onChange={(e) => setHrv(e.target.value)}
            onBlur={() => save({ hrv })}
          />
        </div>
        <div>
          <label className="label">Schlaf (hh:mm)</label>
          <input
            type="time"
            className="input"
            value={sleepDuration}
            disabled={readOnly}
            onChange={(e) => setSleepDuration(e.target.value)}
            onBlur={() => save({ sleepDuration })}
          />
        </div>
        <div>
          <label className="label">Qualität (1-10)</label>
          <input
            type="number"
            min={1}
            max={10}
            className="input"
            value={sleepQuality}
            disabled={readOnly}
            onChange={(e) => setSleepQuality(e.target.value)}
            onBlur={() => save({ sleepQuality })}
          />
        </div>
      </div>
      {!readOnly && status === "saving" && <p className="text-[11px] text-mist">Speichert…</p>}
      {!readOnly && status === "saved" && <p className="text-[11px] text-moss">Gespeichert.</p>}
      {!readOnly && status === "error" && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
