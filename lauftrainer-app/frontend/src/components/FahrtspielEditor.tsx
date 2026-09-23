"use client";

import { useState } from "react";

import { SegmentRow } from "@/components/SegmentRow";
import {
  fahrtspielPatternFromSegments,
  fahrtspielSegments,
  formatFahrtspielCompact,
  parseFahrtspielMinutes,
  segmentsKmByZone,
  segmentsTotalKm,
} from "@/lib/plan";
import { applyDerivedPaces, type SegmentZoneInput } from "@/lib/paceZones";
import { deriveSegmentPatch } from "@/lib/segmentDerive";
import type { PlanSegment } from "@/types/training";

function defaultFrameSegment(type: "warmup" | "cooldown"): PlanSegment {
  return { type, repeat: 1, distance_km: type === "warmup" ? 3 : 2, duration_s: null, pace: "", watts: null, zone: "GA1", note: "" };
}

function coreSegmentsFrom(segments: PlanSegment[]): PlanSegment[] {
  return segments.filter((s) => s.type !== "warmup" && s.type !== "cooldown");
}

// Eingabe fuer eine Fahrtspiel-Schwelleneinheit - sieht wie das Template
// einer festen Intervall-Einheit aus (Auf-/Abwaermen als dieselben
// Segment-Zeilen wie SegmentEditor.tsx, siehe components/SegmentRow.tsx),
// nur dass die Hauptbelastung (statt einzelner Intervall-/Trabpause-Zeilen)
// als eine einfache Zahlenfolge der Wiederholungsdauern in Minuten
// eingetragen wird (z.B. "3-4-6-5-7-3" fuer sechs unterschiedlich lange
// Belastungen) - die Pausen dazwischen (ein Drittel der jeweiligen
// Wiederholungsdauer) werden automatisch ergaenzt (siehe
// lib/plan.ts:fahrtspielSegments). Auf-/Abwaermen sind optional (per
// "+ .. hinzufuegen"/× wie ein einzelnes SegmentEditor-Segment) - anders
// als bei der festen Vorlage nicht automatisch dabei, da eine
// Fahrtspiel-Einheit auch bewusst direkt mit der ersten Belastung starten
// kann. Alle Paces (Belastung/Pause/Auf-/Abwaermen) werden zunaechst aus den
// Trainingsbereichen des Athleten abgeleitet ("Auto-Vorschlag,
// ueberschreibbar") - je Wiederholung und Pause einzeln per Ausklappen
// (siehe "Tempo je Wiederholung anpassen" unten), damit sowohl beim Planen
// als auch beim Protokollieren einer tatsaechlich gelaufenen Einheit die
// gelaufene Geschwindigkeit jeder einzelnen Belastung/Pause von der
// automatisch abgeleiteten Pace abweichen kann - analog zu SegmentEditor.tsx
// bei der festen Intervall-Vorlage.
export function FahrtspielEditor({
  segments,
  onChange,
  athleteZones = null,
  // "plan": Pace-Vorschlag folgt der Zielzone (deriveZonePace). "log":
  // Protokollieren einer tatsaechlich gelaufenen Einheit - die eingegebene
  // Pace + Intervalllaenge schlaegt umgekehrt die Zone vor
  // (classifyPaceZone), bleibt aber ueberschreibbar - siehe
  // lib/segmentDerive.ts:deriveSegmentPatch, identisch zu SegmentEditor.tsx.
  mode = "plan",
}: {
  segments: PlanSegment[];
  onChange: (segments: PlanSegment[]) => void;
  athleteZones?: SegmentZoneInput | null;
  mode?: "plan" | "log";
}) {
  // Lokaler Rohtext statt direkt aus `segments` abgeleitet, damit man z.B.
  // "3-4-" tippen kann, ohne dass der unvollstaendige letzte Wert bei jedem
  // Tastendruck aus der Anzeige verschwindet (parseFahrtspielMinutes
  // ignoriert unvollstaendige/leere Segmente ohnehin).
  const [text, setText] = useState(() => fahrtspielPatternFromSegments(segments));
  // Auf-/Abwaermen werden als eigenstaendige Segmente gehalten (nicht Teil
  // von `fahrtspielSegments`), damit sie ueber dieselbe Zeilen-Komponente
  // wie SegmentEditor bearbeitet werden koennen (Typ/Distanz-Dauer/Pace/
  // Zone/Notiz) - null, solange keins angelegt wurde.
  const [warmup, setWarmup] = useState<PlanSegment | null>(() => segments.find((s) => s.type === "warmup") ?? null);
  const [cooldown, setCooldown] = useState<PlanSegment | null>(() => segments.find((s) => s.type === "cooldown") ?? null);
  // Die Kernbelastung (Wiederholungen + Trabpausen) wird eigenstaendig
  // gehalten statt bei jedem Rendern neu aus `text` abgeleitet - sonst
  // wuerde eine einzeln (per Zeile unten) angepasste Pace beim naechsten
  // Tastendruck im Textfeld sofort wieder ueberschrieben.
  const [core, setCore] = useState<PlanSegment[]>(() => coreSegmentsFrom(segments));
  const [expanded, setExpanded] = useState(false);

  function commitAll(nextWarmup: PlanSegment | null, nextCore: PlanSegment[], nextCooldown: PlanSegment | null) {
    onChange([...(nextWarmup ? [nextWarmup] : []), ...nextCore, ...(nextCooldown ? [nextCooldown] : [])]);
  }

  function handleTextChange(value: string) {
    setText(value);
    const minutes = parseFahrtspielMinutes(value);
    const nextCore = applyDerivedPaces(fahrtspielSegments(minutes), athleteZones);
    setCore(nextCore);
    commitAll(warmup, nextCore, cooldown);
  }

  function updateFrame(which: "warmup" | "cooldown", patch: Partial<PlanSegment>) {
    const current = which === "warmup" ? warmup : cooldown;
    if (!current) return;
    const finalPatch = deriveSegmentPatch(current, patch, {
      mode,
      isCycling: false,
      targetZone: null,
      athleteZones,
      athleteWattZones: null,
    });
    const next = { ...current, ...finalPatch };
    if (which === "warmup") {
      setWarmup(next);
      commitAll(next, core, cooldown);
    } else {
      setCooldown(next);
      commitAll(warmup, core, next);
    }
  }

  function addFrame(which: "warmup" | "cooldown") {
    // Pace direkt beim Anlegen vorbelegen (wie defaultSegments() + die
    // applyDerivedPaces()-Kombination beim Wechsel zu "Intervalle", siehe
    // PlanSessionFields.tsx:setZone/setMethod) statt sie erst bei der
    // naechsten manuellen Aenderung ueber deriveSegmentPatch abzuleiten.
    const next = applyDerivedPaces([defaultFrameSegment(which)], athleteZones)[0];
    if (which === "warmup") {
      setWarmup(next);
      commitAll(next, core, cooldown);
    } else {
      setCooldown(next);
      commitAll(warmup, core, next);
    }
  }

  function removeFrame(which: "warmup" | "cooldown") {
    if (which === "warmup") {
      setWarmup(null);
      commitAll(null, core, cooldown);
    } else {
      setCooldown(null);
      commitAll(warmup, core, null);
    }
  }

  function updateCoreSegment(index: number, patch: Partial<PlanSegment>) {
    const segment = core[index];
    const finalPatch = deriveSegmentPatch(segment, patch, {
      mode,
      isCycling: false,
      targetZone: "Schwelle",
      athleteZones,
      athleteWattZones: null,
    });
    const nextCore = core.map((s, i) => (i === index ? { ...s, ...finalPatch } : s));
    setCore(nextCore);
    setText(fahrtspielPatternFromSegments(nextCore));
    commitAll(warmup, nextCore, cooldown);
  }

  function removeCoreSegment(index: number) {
    const nextCore = core.filter((_, i) => i !== index);
    setCore(nextCore);
    setText(fahrtspielPatternFromSegments(nextCore));
    commitAll(warmup, nextCore, cooldown);
  }

  const totalKm = segmentsTotalKm(segments);
  const kmByZone = segmentsKmByZone(segments);
  const compact = segments.length > 0 ? formatFahrtspielCompact(segments) : "";

  return (
    <div className="space-y-2">
      {warmup ? (
        <SegmentRow
          segment={warmup}
          onUpdate={(patch) => updateFrame("warmup", patch)}
          onRemove={() => removeFrame("warmup")}
          mode={mode}
          typeOptions={["warmup"]}
        />
      ) : (
        <button type="button" onClick={() => addFrame("warmup")} className="text-xs text-moss transition-colors hover:underline">
          + Aufwärmen hinzufügen
        </button>
      )}

      <div className="rounded-lg border border-mist/15 p-2">
        <label className="label">Wiederholungsdauern (Minuten, z.B. 3-4-6-5-7-3)</label>
        <input
          type="text"
          className="input"
          placeholder="3-4-6-5-7-3"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
        />
      </div>

      {core.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-moss transition-colors hover:underline"
          >
            {expanded ? "▾" : "▸"} Tempo je Wiederholung {mode === "log" ? "erfassen" : "anpassen"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {core.map((segment, i) => (
                <SegmentRow
                  key={i}
                  segment={segment}
                  onUpdate={(patch) => updateCoreSegment(i, patch)}
                  onRemove={() => removeCoreSegment(i)}
                  mode={mode}
                  targetZone="Schwelle"
                  typeOptions={[segment.type]}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {cooldown ? (
        <SegmentRow
          segment={cooldown}
          onUpdate={(patch) => updateFrame("cooldown", patch)}
          onRemove={() => removeFrame("cooldown")}
          mode={mode}
          typeOptions={["cooldown"]}
        />
      ) : (
        <button type="button" onClick={() => addFrame("cooldown")} className="text-xs text-moss transition-colors hover:underline">
          + Cooldown hinzufügen
        </button>
      )}

      {compact && (
        <p className="text-xs text-mist">
          {compact}
          {totalKm > 0 &&
            ` · ${totalKm.toFixed(1)} km gesamt (${Object.entries(kmByZone)
              .map(([zone, km]) => `${zone} ${km.toFixed(1)}`)
              .join(" · ")})`}
        </p>
      )}
    </div>
  );
}
