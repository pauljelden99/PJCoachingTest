"use client";

import { useState } from "react";

import { FahrtspielSegmentsView } from "@/components/FahrtspielSegmentsView";
import { formatDuration } from "@/lib/format";
import { CYCLING_ZONES, formatSegment, isNotableMethod } from "@/lib/plan";
import { formatPaceValue } from "@/lib/pace";
import type { Activity } from "@/types/training";

export const SOURCE_LABEL: Record<string, string> = {
  strava: "Strava",
  manual: "Manuell",
};

// Fuer Radeinheiten ist eine Geschwindigkeit (km/h) die gebraeuchliche
// Tempo-Angabe, nicht die Lauf-Pace (min/km) - berechnet aus Distanz/Dauer,
// da fuer Radeinheiten kein eigenes Tempo-Feld erfasst wird.
function bikeSpeedKmh(activity: Activity): string | null {
  if (!activity.target_zone || !CYCLING_ZONES.includes(activity.target_zone)) return null;
  if (!activity.distance_m || !activity.duration_s) return null;
  const kmh = activity.distance_m / 1000 / (activity.duration_s / 3600);
  return `${kmh.toFixed(1)} km/h`;
}

// Pace (min/km) fuer alles ausser Radeinheiten (dort gilt km/h, siehe
// bikeSpeedKmh) - aus Distanz/Dauer, da fuer Aktivitaeten kein eigenes
// Pace-Feld gespeichert wird.
function runPaceMinPerKm(activity: Activity): string | null {
  if (activity.target_zone && CYCLING_ZONES.includes(activity.target_zone)) return null;
  if (!activity.distance_m || !activity.duration_s) return null;
  const secPerKm = activity.duration_s / (activity.distance_m / 1000);
  return `${formatPaceValue(secPerKm)} /km`;
}

// Rein darstellende Karte fuer eine einzelne protokollierte Aktivitaet -
// genutzt sowohl von ActivityList.tsx (dort innerhalb der nach Tag
// gruppierten, aufklappbaren Liste) als auch von PlanProtokollDayRows.tsx
// (dort direkt als Zeileninhalt einer Tageszeile, ohne Tagesgruppierung).
export function ActivityCard({
  activity,
  onEdit,
  onDelete,
  deleting = false,
}: {
  activity: Activity;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const speedKmh = bikeSpeedKmh(activity);
  const paceMinPerKm = runPaceMinPerKm(activity);
  // Standardmaessig eingeklappt - nur Titel und Zielzone sichtbar, alle
  // weiteren Werte (Dauer/Distanz/Tempo/Puls/Last/Segmente/Notiz) erst nach
  // Ausklappen, damit Plan & Protokoll bei mehreren Einheiten je Tag
  // uebersichtlich bleibt statt jede Einheit vollstaendig auszubreiten.
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-surface/60 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-wrap items-center gap-2 text-left"
        >
          <span className="text-xs text-mist">{expanded ? "▾" : "▸"}</span>
          <span className="text-sm font-medium text-ink">
            {activity.title || SOURCE_LABEL[activity.source] || activity.source}
          </span>
          {activity.target_zone && (
            <span className="badge bg-moss/15 text-moss">
              {activity.target_zone}
              {isNotableMethod(activity.target_zone, activity.method) ? ` (${activity.method})` : ""}
            </span>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {onEdit && (
            <button type="button" onClick={onEdit} className="link-action">
              Bearbeiten
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={deleting} className="link-action text-danger">
              Löschen
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-mist">{formatDuration(activity.duration_s)}</span>
            {activity.distance_m != null && (
              <span className="text-mist">{(activity.distance_m / 1000).toFixed(1)} km</span>
            )}
            {speedKmh && <span className="text-mist">{speedKmh}</span>}
            {paceMinPerKm && <span className="text-mist">{paceMinPerKm}</span>}
            {activity.elevation_gain_m != null && (
              <span className="text-mist">↑ {Math.round(activity.elevation_gain_m)} hm</span>
            )}
            {activity.avg_hr != null && <span className="text-mist">⌀ {Math.round(activity.avg_hr)} bpm</span>}
            <span className="text-mist">Last {Math.round(activity.daily_load)}</span>
          </div>
          {activity.description && <p className="mt-1.5 text-xs text-mist">{activity.description}</p>}
          {activity.segments.length > 0 &&
            (activity.method === "Fahrtspiel" ? (
              <FahrtspielSegmentsView segments={activity.segments} />
            ) : (
              <div className="mt-1.5 space-y-0.5">
                {activity.segments.map((segment, i) => (
                  <p key={i} className="text-xs text-mist">
                    {formatSegment(segment)}
                  </p>
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
