"use client";

import { useState } from "react";

import { formatFahrtspielCompact, formatSegment, segmentsKmByZone, segmentsTotalKm } from "@/lib/plan";
import type { PlanSegment } from "@/types/training";

// Kompakte, ausklappbare Anzeige einer Fahrtspiel-Einheit (Plan/Protokoll,
// siehe PlanProtokollDayRows.tsx/ActivityCard.tsx) - eingeklappt eine
// Zeile mit dem Wiederholungsmuster, der Tempospanne der Belastungen und
// der Pausenspanne (z.B. "3-4-5-6-5-4-3 @3:25-3:18 min/km, 1-2' TP" statt
// einer Zeile je Wiederholung/Pause wie bei der festen Intervall-Vorlage,
// siehe lib/plan.ts:formatFahrtspielCompact), ausgeklappt die exakte
// Dauer/Pace jeder einzelnen Wiederholung und Pause (je eine Zeile ueber
// formatSegment, wie bei anderen strukturierten Einheiten).
export function FahrtspielSegmentsView({ segments }: { segments: PlanSegment[] }) {
  const [expanded, setExpanded] = useState(false);
  if (segments.length === 0) return null;

  const compact = formatFahrtspielCompact(segments);
  const totalKm = segmentsTotalKm(segments);
  const kmByZone = segmentsKmByZone(segments);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-1 text-left text-xs text-mist transition-colors hover:text-ink"
      >
        <span className="shrink-0">{expanded ? "▾" : "▸"}</span>
        <span>{compact}</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5">
          {segments.map((segment, i) => (
            <p key={i} className="text-xs text-mist">
              {formatSegment(segment)}
            </p>
          ))}
        </div>
      )}
      {totalKm > 0 && (
        <p className="ml-3 text-xs text-mist">
          ≈ {totalKm.toFixed(1)} km gesamt (
          {Object.entries(kmByZone)
            .map(([zone, km]) => `${zone} ${km.toFixed(1)}`)
            .join(" · ")}
          )
        </p>
      )}
    </div>
  );
}
