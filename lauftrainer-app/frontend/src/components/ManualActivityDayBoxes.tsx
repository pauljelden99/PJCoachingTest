"use client";

import { useState } from "react";

import { ManualActivityForm } from "@/components/ManualActivityForm";
import { daysInRange, formatDateDMY, groupByDay, shortWeekdayLabel } from "@/lib/plan";
import type { SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { Activity, PlannedSession } from "@/types/training";

// Ein Kasten pro Tag des gewaehlten Zeitraums statt eines einzelnen grossen
// Buttons oberhalb von Plan und Protokoll - Klick auf einen Tag oeffnet das
// Erfassungsformular (ManualActivityForm) direkt fuer diesen Tag (Tag dort
// fest vorgegeben statt frei waehlbar, siehe day-Prop). Immer nur ein Tag
// gleichzeitig aufgeklappt.
export function ManualActivityDayBoxes({
  rangeStart,
  rangeEnd,
  activities,
  athleteId,
  athleteZones = null,
  athleteWattZones = null,
  plannedSessions = [],
  onLogged,
}: {
  rangeStart: string;
  rangeEnd: string;
  activities: Activity[];
  athleteId?: number;
  athleteZones?: SegmentZoneInput | null;
  athleteWattZones?: WattZoneInput | null;
  plannedSessions?: PlannedSession[];
  onLogged: () => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const days = daysInRange(rangeStart, rangeEnd);
  const kmByDay = new Map(
    groupByDay(activities).map((g) => [g.day, g.items.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000])
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-mist">Training manuell erfassen</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const isOpen = openDay === day;
          const dayKm = kmByDay.get(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => setOpenDay(isOpen ? null : day)}
              className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                isOpen
                  ? "border-moss bg-moss/10 text-moss"
                  : "border-dashed border-mist/30 bg-surface/50 text-mist hover:border-moss hover:text-moss"
              }`}
            >
              <div className="font-medium">{shortWeekdayLabel(day)}</div>
              <div>{formatDateDMY(day)}</div>
              <div className="mt-1">{dayKm ? `${dayKm.toFixed(1)} km` : isOpen ? "− Schließen" : "+ Erfassen"}</div>
            </button>
          );
        })}
      </div>

      {openDay && (
        <ManualActivityForm
          key={openDay}
          day={openDay}
          athleteId={athleteId}
          athleteZones={athleteZones}
          athleteWattZones={athleteWattZones}
          plannedSessions={plannedSessions}
          onCancel={() => setOpenDay(null)}
          onLogged={() => {
            onLogged();
            setOpenDay(null);
          }}
        />
      )}
    </div>
  );
}
