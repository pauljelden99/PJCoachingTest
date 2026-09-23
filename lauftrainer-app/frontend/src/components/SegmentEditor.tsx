"use client";

import { SegmentRow } from "@/components/SegmentRow";
import { bareZone, emptySegment, segmentsTotalKm, segmentTypesForSport } from "@/lib/plan";
import { deriveSegmentPatch } from "@/lib/segmentDerive";
import type { SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { PlanSegment } from "@/types/training";

export function SegmentEditor({
  segments,
  onChange,
  athleteZones = null,
  // "plan": Zone wird gewaehlt und bestimmt den Pace-Vorschlag
  // (deriveZonePace, siehe Planungsformulare). "log": Protokollieren einer
  // tatsaechlich gelaufenen Einheit - hier schlaegt umgekehrt die
  // eingegebene Pace + Intervalllaenge die Zone vor (classifyPaceZone),
  // bleibt aber wie der Pace-Vorschlag im Plan-Modus manuell
  // ueberschreibbar (siehe ManualActivityForm.tsx/ActivityEditForm.tsx).
  mode = "plan",
  // Zielzone der gesamten Einheit ("Hauptbelastung") - die Intervall-Zone
  // ist im Plan-Modus daran gekoppelt statt einzeln waehlbar (siehe
  // PlanSessionFields.tsx:setZone).
  targetZone = null,
  // Sportart der Einheit (siehe lib/plan.ts:sportOfTargetZone), von
  // PlanSessionFields.tsx aus targetZone abgeleitet - steuert bei "bike"
  // die verfuegbaren Segmenttypen (keine Trabpause, "Pause" statt
  // "Stehpause") und die Watt- statt Pace-Eingabe.
  sport = null,
  athleteWattZones = null,
}: {
  segments: PlanSegment[];
  onChange: (segments: PlanSegment[]) => void;
  athleteZones?: SegmentZoneInput | null;
  mode?: "plan" | "log";
  targetZone?: string | null;
  sport?: "run" | "bike" | "swim" | null;
  athleteWattZones?: WattZoneInput | null;
}) {
  const isCycling = sport === "bike";
  const segmentTypes = segmentTypesForSport(sport);

  function updateSegment(index: number, patch: Partial<PlanSegment>) {
    const segment = segments[index];
    const finalPatch = deriveSegmentPatch(segment, patch, { mode, isCycling, targetZone, athleteZones, athleteWattZones });
    onChange(segments.map((s, i) => (i === index ? { ...s, ...finalPatch } : s)));
  }

  function removeSegment(index: number) {
    onChange(segments.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Ablauf</label>
        <button
          type="button"
          onClick={() => {
            const next = emptySegment();
            // Ein neu hinzugefuegtes Segment ist immer vom Typ "interval"
            // (siehe emptySegment) - im Plan-Modus sofort mit der Zielzone
            // der Einheit belegen, statt bis zur naechsten Aenderung mit
            // zone=null dazustehen (siehe zoneLocked-Anzeige in SegmentRow).
            // Bei Sprint/Reps gilt das auch im Log-Modus, da sich dort keine
            // Zone aus der (fuer Sprints als Zielzeit statt Pace-pro-km
            // genutzten) Pace ableiten laesst (siehe segmentDerive.ts).
            if (mode === "plan" || bareZone(targetZone) === "Sprint/Reps") next.zone = bareZone(targetZone);
            onChange([...segments, next]);
          }}
          className="text-xs text-moss transition-colors hover:underline"
        >
          + Segment hinzufügen
        </button>
      </div>

      {segments.length > 0 && (
        <div className="space-y-2">
          {segments.map((segment, i) => (
            <SegmentRow
              key={i}
              segment={segment}
              onUpdate={(patch) => updateSegment(i, patch)}
              onRemove={() => removeSegment(i)}
              mode={mode}
              targetZone={targetZone}
              sport={sport}
              typeOptions={segmentTypes}
            />
          ))}
          <p className="text-xs text-mist">Gesamtdistanz aus Segmenten: {segmentsTotalKm(segments).toFixed(1)} km</p>
        </div>
      )}
    </div>
  );
}
