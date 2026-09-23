"use client";

import { useState } from "react";

import { bareZone, segmentTypeLabel } from "@/lib/plan";
import type { PlanSegment, SegmentType } from "@/types/training";

const ZONE_OPTIONS = ["", "GA1", "Schwelle", "VO2max", "Sprint/Reps"];

// Auf-/Abwaermen laufen nie wiederholt (siehe lib/plan.ts:defaultSegments) -
// die "Anzahl"-Eingabe ergibt fuer diese beiden Typen keinen Sinn und wird
// ausgeblendet statt nur deaktiviert.
const NO_REPEAT_TYPES = new Set(["warmup", "cooldown"]);

type DistanceUnit = "m" | "km";
type DurationUnit = "sek" | "min";
type Unit = DistanceUnit | DurationUnit;

// Welche Distanz-/Zeiteinheiten je Segmenttyp zur Auswahl stehen - siehe
// components/SegmentEditor.tsx fuer die ausfuehrliche Begruendung.
function unitOptionsForType(
  type: PlanSegment["type"],
  isCycling: boolean
): { distance: DistanceUnit[]; duration: DurationUnit[] } {
  if (isCycling) return { distance: [], duration: ["min", "sek"] };
  if (type === "interval" || type === "jog_recovery") return { distance: ["m", "km"], duration: ["sek", "min"] };
  if (type === "rest") return { distance: [], duration: ["sek", "min"] };
  return { distance: ["km"], duration: ["min"] };
}

// Eine einzelne Segment-Zeile (Typ, Wiederholungen, Distanz/Dauer + Einheit,
// Pace/Watt, Zone, Notiz) - reine Darstellung ohne eigene Ableitungslogik,
// extrahiert aus components/SegmentEditor.tsx, damit dieselbe Zeilen-Optik
// auch ausserhalb einer generischen Segmentliste wiederverwendet werden kann
// (siehe components/FahrtspielEditor.tsx: Auf-/Abwaermen einer
// Fahrtspiel-Einheit, "aussehen wie das Intervalle-Template"). `onUpdate`
// gibt nur den rohen Patch nach oben durch - die Struktur-/Auto-Vorschlag-
// Regeln (siehe lib/segmentDerive.ts:deriveSegmentPatch) wendet der
// Aufrufer an, bevor er das Segment tatsaechlich aktualisiert.
export function SegmentRow({
  segment,
  onUpdate,
  onRemove,
  mode = "plan",
  targetZone = null,
  sport = null,
  typeOptions,
}: {
  segment: PlanSegment;
  onUpdate: (patch: Partial<PlanSegment>) => void;
  onRemove: () => void;
  mode?: "plan" | "log";
  targetZone?: string | null;
  sport?: "run" | "bike" | "swim" | null;
  // Welche Segmenttypen im Typ-Dropdown dieser Zeile zur Auswahl stehen -
  // die volle Liste (segmentTypesForSport) im generischen SegmentEditor,
  // eine feste Einzelauswahl (z.B. nur "warmup") fuer eine dedizierte
  // Auf-/Abwaerm-Zeile ausserhalb einer generischen Segmentliste.
  typeOptions: SegmentType[];
}) {
  const isCycling = sport === "bike";
  const [unitOverride, setUnitOverride] = useState<{ distance?: DistanceUnit; duration?: DurationUnit }>({});

  const noRepeat = NO_REPEAT_TYPES.has(segment.type);
  const noZone = segment.type === "rest";
  // Sprint/Reps-Bloecke sind immer an die Zielzone gebunden, auch beim
  // Protokollieren (mode="log") - eine Pace-basierte Zonen-Vorschlagsauswahl
  // ergibt bei einer Zielzeit statt Pace-pro-km keinen Sinn, siehe
  // lib/segmentDerive.ts.
  const isSprintReps = segment.type === "interval" && bareZone(targetZone) === "Sprint/Reps";
  const zoneLocked =
    segment.type === "jog_recovery" || (segment.type === "interval" && (mode === "plan" || isSprintReps));
  const lockedZoneValue = segment.type === "jog_recovery" ? "GA1" : bareZone(targetZone);

  const unitOptions = unitOptionsForType(segment.type, isCycling);
  const distanceUnit =
    unitOverride.distance && unitOptions.distance.includes(unitOverride.distance)
      ? unitOverride.distance
      : unitOptions.distance[0];
  // Vorgabe "min" statt des sonst ersten Listeneintrags ("sek"), sofern die
  // aktuelle Dauer einer ganzen Minutenzahl entspricht - eine 180s-Pause
  // soll als "3 min" statt "180 sek" angezeigt werden, eine 90s-Pause
  // dagegen weiterhin in Sekunden (keine sinnvolle Minutenanzeige).
  const defaultDurationUnit: DurationUnit =
    segment.duration_s != null && segment.duration_s > 0 && segment.duration_s % 60 === 0 && unitOptions.duration.includes("min")
      ? "min"
      : unitOptions.duration[0];
  const durationUnit =
    unitOverride.duration && unitOptions.duration.includes(unitOverride.duration)
      ? unitOverride.duration
      : defaultDurationUnit;
  const isDuration = isCycling || segment.type === "rest" ? true : segment.duration_s != null;
  const activeUnit: Unit = isDuration ? durationUnit : distanceUnit;
  const toDisplayDistance = (km: number) => (distanceUnit === "m" ? Math.round(km * 1000) : km);
  const fromDisplayDistance = (v: number) => (distanceUnit === "m" ? v / 1000 : v);
  const toDisplayDuration = (s: number) => (durationUnit === "sek" ? s : s / 60);
  const fromDisplayDuration = (v: number) => (durationUnit === "sek" ? v : v * 60);

  function setUnit(unit: Unit) {
    const nextIsDuration = unit === "sek" || unit === "min";
    setUnitOverride((prev) => ({
      ...prev,
      ...(nextIsDuration ? { duration: unit as DurationUnit } : { distance: unit as DistanceUnit }),
    }));
    if (nextIsDuration !== isDuration) {
      onUpdate(nextIsDuration ? { duration_s: 0, distance_km: null } : { distance_km: 0, duration_s: null });
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-mist/15 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className="input min-w-[8rem] flex-[2]"
          value={segment.type}
          onChange={(e) => onUpdate({ type: e.target.value as PlanSegment["type"] })}
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {segmentTypeLabel(t, sport)}
            </option>
          ))}
        </select>
        {!noRepeat && (
          <input
            type="number"
            min={1}
            title="Wiederholungen"
            placeholder="×"
            className="input w-14"
            value={segment.repeat}
            onChange={(e) => onUpdate({ repeat: Number(e.target.value) || 1 })}
          />
        )}
        {isSprintReps ? (
          // Sprint/Reps: Distanz (m) UND Zeit (s) werden gleichzeitig
          // erfasst statt sich gegenseitig auszuschliessen (wie sonst bei
          // Distanz/Dauer) oder ueber das pace-Feld transportiert zu werden
          // (z.B. "100m in 13s") - bei so kurzen Distanzen/Zeiten laesst
          // sich weder sinnvoll eine Pace/km bilden noch eines der beiden
          // Felder aus dem anderen ableiten. Beide Werte landen direkt in
          // distance_km/duration_s, damit dieselben Segmente wie bei jedem
          // anderen Intervall in die Distanz-/Lastberechnung eingehen
          // (siehe backend/app/services/zone_classifier.py:
          // segment_velocity_and_duration_s - dessen erster Zweig genau
          // diese Kombination aus gesetzter Distanz UND Dauer erwartet).
          <>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={1}
                title="Distanz (m)"
                placeholder="m"
                className="input w-16"
                value={segment.distance_km != null ? Math.round(segment.distance_km * 1000) : ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  onUpdate({ distance_km: v !== null ? v / 1000 : null });
                }}
              />
              <span className="text-xs text-mist">m</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.1}
                title="Zeit (Sekunden)"
                placeholder="s"
                className="input w-16"
                value={segment.duration_s ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  onUpdate({ duration_s: v });
                }}
              />
              <span className="text-xs text-mist">s</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={activeUnit === "m" || activeUnit === "sek" ? 1 : activeUnit === "min" ? 0.5 : 0.1}
              title={isDuration ? `Dauer (${activeUnit})` : `Distanz (${activeUnit})`}
              placeholder={activeUnit}
              className="input w-20"
              value={
                isDuration
                  ? segment.duration_s != null
                    ? toDisplayDuration(segment.duration_s)
                    : ""
                  : segment.distance_km != null
                    ? toDisplayDistance(segment.distance_km)
                    : ""
              }
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                onUpdate(
                  isDuration
                    ? { duration_s: v !== null ? fromDisplayDuration(v) : null, distance_km: null }
                    : { distance_km: v !== null ? fromDisplayDistance(v) : null, duration_s: null }
                );
              }}
            />
            <select className="input w-14 px-1" title="Einheit" value={activeUnit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {unitOptions.distance.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              {unitOptions.duration.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}
        {isSprintReps
          ? null
          : isCycling
            ? (
              <input
                type="number"
                min={0}
                title="Watt"
                placeholder="Watt"
                className="input w-20"
                value={segment.watts ?? ""}
                onChange={(e) => onUpdate({ watts: e.target.value ? Number(e.target.value) : null })}
              />
            )
            : (
              segment.type !== "rest" && (
                <input
                  type="text"
                  title="Pace (min:sek/km)"
                  placeholder="Pace"
                  className="input w-20"
                  value={segment.pace}
                  onChange={(e) => onUpdate({ pace: e.target.value })}
                />
              )
            )}
        {noZone ? null : zoneLocked ? (
          <div
            className="input min-w-[6rem] flex-1 text-mist"
            title="Automatisch aus der Zielzone der Einheit (Hauptbelastung) bzw. pauschal GA1"
          >
            {lockedZoneValue || "Zone -"}
          </div>
        ) : (
          <select
            className="input min-w-[6rem] flex-1"
            title={mode === "log" ? "Tempozone (aus Pace und Intervalllänge vorgeschlagen, überschreibbar)" : "Zielzone"}
            value={segment.zone ?? ""}
            onChange={(e) => onUpdate({ zone: e.target.value || null })}
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {z || "Zone -"}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={onRemove} className="ml-auto px-1 text-danger transition-colors hover:underline" title="Segment entfernen">
          ×
        </button>
      </div>
      <input
        type="text"
        placeholder="Notiz (optional)"
        className="input"
        value={segment.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
      />
    </div>
  );
}
