"use client";

import { useEffect, useRef } from "react";

import { FahrtspielEditor } from "@/components/FahrtspielEditor";
import { SegmentEditor } from "@/components/SegmentEditor";
import {
  computeAutoTitle,
  defaultSegments,
  isNotableMethod,
  methodOptionsForZone,
  segmentsTotalKm,
  segmentsVisibleForZone,
  sportOfTargetZone,
  TARGET_ZONE_GROUPS,
  zoneUsesDuration,
} from "@/lib/plan";
import { applyDerivedPaces, deriveZonePace, type SegmentZoneInput } from "@/lib/paceZones";
import { applyDerivedWatts, type WattZoneInput } from "@/lib/wattZones";
import type { PlanSegment, PlannedSessionInput } from "@/types/training";

export interface PlanSessionValue {
  day: string;
  title: string;
  description: string;
  target_zone: string;
  // Methodik-Variante der Zielzone (aktuell nur "Fahrtspiel" fuer
  // target_zone="Schwelle") - siehe lib/plan.ts:METHODS_BY_ZONE.
  method: string;
  target_distance_km: string;
  // Lokaler Minuten-String fuers Formular (Backend/API speichern Sekunden
  // in target_duration_s, wie bei Activity.duration_s/PlanSegment.duration_s
  // - siehe Umrechnung beim jeweiligen Submit).
  target_duration_min: string;
  // "mm:ss"/km - editierbares Ziel-Tempo fuer nicht-strukturierte Einheiten
  // (v.a. GA1 ohne Segmente, siehe unten). Bei strukturierten Einheiten
  // ungenutzt, dort steckt das Tempo pro Segment in segments[].pace.
  target_pace: string;
  segments: PlanSegment[];
}

export function emptyPlanSessionValue(day = ""): PlanSessionValue {
  return {
    day,
    title: "",
    description: "",
    target_zone: "",
    method: "",
    target_distance_km: "",
    target_duration_min: "",
    target_pace: "",
    segments: [],
  };
}

export function planSessionValueFromSession(session: {
  day: string;
  title: string;
  description: string;
  target_zone: string | null;
  method?: string | null;
  target_distance_km: number | null;
  target_duration_s: number | null;
  target_pace: string;
  segments: PlanSegment[];
}): PlanSessionValue {
  return {
    day: session.day,
    title: session.title,
    description: session.description,
    target_zone: session.target_zone ?? "",
    // Bestehende Einheiten ohne Methodik (null, vor Einfuehrung von
    // "Intervalle"/"Fahrtspiel" angelegt) gelten implizit als "Intervalle" -
    // sonst zeigte die Auswahl faelschlich leer statt der tatsaechlich
    // genutzten festen Segment-Vorlage.
    method: session.method ?? (methodOptionsForZone(session.target_zone)[0] ?? ""),
    target_distance_km: session.target_distance_km?.toString() ?? "",
    target_duration_min: session.target_duration_s ? (session.target_duration_s / 60).toString() : "",
    target_pace: session.target_pace,
    segments: session.segments,
  };
}

// Baut aus dem Formularzustand das API-Payload - je nach Zone ist entweder
// die Distanz (ggf. aus Segmenten aufsummiert), die Dauer (Athletik/
// Beweglichkeit) oder keins von beiden gesetzt. Gemeinsam genutzt von
// PlanEditor.tsx und WeekPlanBoard.tsx, damit Anlegen und Bearbeiten
// exakt dieselbe Payload-Logik verwenden.
export function buildPlanSessionPayload(value: PlanSessionValue): PlannedSessionInput {
  const segmentsVisible = segmentsVisibleForZone(value.target_zone);
  const durationMode = zoneUsesDuration(value.target_zone);
  return {
    day: value.day,
    title: value.title,
    description: value.description,
    target_zone: value.target_zone || null,
    // Nur uebernehmen, wenn die gewaehlte Zone diese Methodik ueberhaupt
    // anbietet (siehe methodOptionsForZone) - verhindert ein stehen
    // gebliebenes "Fahrtspiel" nach einem Zonenwechsel weg von Schwelle.
    method: methodOptionsForZone(value.target_zone).includes(value.method) ? value.method : null,
    target_distance_km: durationMode
      ? null
      : segmentsVisible
        ? segmentsTotalKm(value.segments) || null
        : value.target_distance_km
          ? Number(value.target_distance_km)
          : null,
    target_duration_s: durationMode && value.target_duration_min ? Number(value.target_duration_min) * 60 : null,
    target_pace: !durationMode && !segmentsVisible ? value.target_pace : "",
    segments: segmentsVisible ? value.segments : [],
  };
}

// Die geteilten Formularfelder einer geplanten Einheit (Titel, Zielzone,
// Distanz/Dauer/Segmente je nach Zone, Notiz) - genutzt von PlanEditor.tsx
// (Bearbeiten, mit Tagesfeld) und WeekPlanBoard.tsx (Anlegen/Bearbeiten im
// Wochenboard, Tag meist implizit durch die Spalte).
export function PlanSessionFields({
  value,
  onChange,
  athleteZones = null,
  athleteWattZones = null,
  showDay = false,
  showTargetPace = true,
  compact = false,
  mode = "plan",
}: {
  value: PlanSessionValue;
  onChange: (patch: Partial<PlanSessionValue>) => void;
  athleteZones?: SegmentZoneInput | null;
  // Fuer Rad-Segmente (Watt statt Pace, siehe SegmentEditor.tsx) - analog
  // zu athleteZones, aber fuer die FTP-basierten Wattzonen.
  athleteWattZones?: WattZoneInput | null;
  showDay?: boolean;
  // Editierbares Ziel-Tempo fuer GA1 (siehe target_pace oben) ist nur beim
  // Planen einer Einheit sinnvoll (PlanEditor.tsx/WeekPlanBoard.tsx) - beim
  // Protokollieren einer tatsaechlich gelaufenen Einheit (ManualActivityForm/
  // ActivityList.tsx, dasselbe Formular) gibt es dafuer bereits ein eigenes
  // "Tempo (tatsaechlich)"-Feld, Activity kennt kein target_pace und wuerde
  // einen hier eingetragenen Wert stillschweigend verwerfen.
  showTargetPace?: boolean;
  compact?: boolean;
  // Durchgereicht an SegmentEditor - "log" berechnet die Segment-Zone aus
  // Pace + Intervalllaenge statt sie waehlen zu lassen (siehe
  // SegmentEditor.tsx, ManualActivityForm.tsx/ActivityEditForm.tsx).
  mode?: "plan" | "log";
}) {
  const segmentsVisible = segmentsVisibleForZone(value.target_zone);
  const durationMode = zoneUsesDuration(value.target_zone);
  const derivedGa1Pace = value.target_zone === "GA1" && athleteZones ? deriveZonePace("GA1", athleteZones) : null;
  const sport = sportOfTargetZone(value.target_zone);

  // Haelt den Titel automatisch auf der Kerneinheit ("12km DL", "4×1000m
  // VO2max", ...) - siehe computeAutoTitle. "Auto-Vorschlag,
  // ueberschreibbar": aktualisiert wird nur, solange der Titel noch dem
  // zuletzt automatisch gesetzten Wert entspricht (oder leer ist) - ein
  // manuell eingetragener Titel (z.B. ein Wettkampfname) bleibt danach
  // unangetastet, selbst wenn sich Distanz/Segmente danach noch aendern.
  const lastAutoTitleRef = useRef("");
  const segmentsKey = JSON.stringify(value.segments);
  useEffect(() => {
    const base = computeAutoTitle(value);
    // Methodik als Klammerzusatz im Auto-Titel ("8km Schwelle (Fahrtspiel)"),
    // solange ueberhaupt ein Basistitel existiert (siehe computeAutoTitle -
    // "" ohne gewaehlte Zielzone bleibt "", damit das Titelfeld frei bleibt) -
    // aber nur fuer eine vom Default abweichende Methodik (siehe
    // isNotableMethod): "Intervalle" ist die implizite Vorgabe und würde
    // sonst jeden Schwelle-Titel unnoetig verlaengern.
    const auto = base && isNotableMethod(value.target_zone, value.method) ? `${base} (${value.method})` : base;
    if (value.title === "" || value.title === lastAutoTitleRef.current) {
      if (value.title !== auto) onChange({ title: auto });
      lastAutoTitleRef.current = auto;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.target_zone, value.method, value.target_distance_km, value.target_duration_min, segmentsKey]);

  // Haelt die GA1-Ziel-Pace automatisch auf dem aus der Jack-Daniels-
  // Trainingsbereichtabelle abgeleiteten Wert (siehe deriveZonePace),
  // solange sie noch dem zuletzt automatisch gesetzten Wert entspricht
  // (oder leer ist) - "Auto-Vorschlag, ueberschreibbar" wie bei den
  // Segment-Paces (applyDerivedPaces) und beim Titel oben. setZone() allein
  // deckt nur den Moment des Zonenwechsels ab; dieser Effekt greift
  // zusaetzlich, wenn die Trainingsbereiche des Athleten erst NACH der
  // Zonenwahl laden (oder sich aendern), waehrend GA1 schon ausgewaehlt ist.
  const lastAutoPaceRef = useRef("");
  const athleteZonesKey = JSON.stringify(athleteZones);
  useEffect(() => {
    if (value.target_zone !== "GA1" || segmentsVisible || !athleteZones) return;
    const derived = deriveZonePace("GA1", athleteZones);
    if (!derived) return;
    if (value.target_pace === "" || value.target_pace === lastAutoPaceRef.current) {
      if (value.target_pace !== derived) onChange({ target_pace: derived });
      lastAutoPaceRef.current = derived;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.target_zone, segmentsVisible, athleteZonesKey]);

  function setZone(zone: string) {
    // Eine Methodik (z.B. "Fahrtspiel") gilt nur fuer bestimmte Zonen (siehe
    // methodOptionsForZone) - bei einem Zonenwechsel, der die bisherige
    // Methodik nicht mehr anbietet, springt sie auf den Default der neuen
    // Zone (erstes Element, z.B. "Intervalle" bei Schwelle) bzw. auf "",
    // wenn die Zone gar keine Methodik kennt, statt unsichtbar stehen zu
    // bleiben.
    const zoneMethods = methodOptionsForZone(zone);
    const method = zoneMethods.includes(value.method) ? value.method : (zoneMethods[0] ?? "");
    // Die Zone der Hauptbelastung (Intervall-Segmente) folgt beim Planen
    // immer der gewaehlten Zielzone der Einheit - beim ersten Aktivieren
    // ueber die Standard-Segmente (defaultSegments), danach durch
    // Nachziehen bestehender Intervall-Segmente bei einem spaeteren
    // Zonenwechsel. Beim Protokollieren (mode="log") bleibt die Intervall-
    // Zone dagegen unabhaengig, da sie dort aus der tatsaechlich
    // eingegebenen Pace klassifiziert wird (siehe SegmentEditor.tsx) und
    // von der urspruenglich geplanten Zielzone abweichen darf. Verliess die
    // bisherige Einheit gerade die Fahrtspiel-Methodik (deren Segmente ein
    // ganz anderes Muster als die feste Vorlage haben), gelten sie wie eine
    // leere Segmentliste - sonst uebernaehme die neue Zone unpassend
    // wechselnde Wiederholungsdauern statt ihrer eigenen Standard-Vorlage.
    const leavingFahrtspiel = value.method === "Fahrtspiel" && method !== "Fahrtspiel";
    const segments =
      segmentsVisibleForZone(zone) && (value.segments.length === 0 || leavingFahrtspiel)
        ? sportOfTargetZone(zone) === "bike"
          ? applyDerivedWatts(defaultSegments(zone), athleteWattZones)
          : applyDerivedPaces(defaultSegments(zone), athleteZones)
        : mode === "plan"
          ? value.segments.map((s) => (s.type === "interval" ? { ...s, zone } : s))
          : value.segments;
    // Beim Wechsel zu GA1 die aus den Athletenzonen abgeleitete Pace als
    // Vorschlag vorbelegen (nur falls noch kein Tempo eingetragen ist) -
    // der Trainer kann sie danach frei ueberschreiben (siehe Eingabefeld
    // unten), analog zum Auto-Vorschlag bei Segmenten (SegmentEditor.tsx).
    const derived = zone === "GA1" && athleteZones ? deriveZonePace("GA1", athleteZones) : null;
    const target_pace = zone === "GA1" && !value.target_pace && derived ? derived : value.target_pace;
    onChange({ target_zone: zone, method, segments, target_pace });
  }

  // Wechsel der Methodik bei gleichbleibender Zone (z.B. Schwelle
  // "Intervalle" <-> "Fahrtspiel") - im Gegensatz zu setZone() bleibt die
  // Zielzone hier fix, nur die Segmente werden auf die zur neuen Methodik
  // passende Ausgangsform zurueckgesetzt: die feste Vorlage (defaultSegments)
  // fuer "Intervalle", eine leere Liste fuer "Fahrtspiel" (dort tippt der
  // Trainer die Wiederholungsdauern selbst ein, siehe FahrtspielEditor.tsx).
  function setMethod(method: string) {
    const segments =
      method === "Fahrtspiel"
        ? []
        : value.target_zone
          ? applyDerivedPaces(defaultSegments(value.target_zone), athleteZones)
          : value.segments;
    onChange({ method, segments });
  }

  const label = (text: string) => !compact && <label className="label">{text}</label>;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {showDay && (
          <div>
            {label("Datum")}
            <input
              type="date"
              className="input"
              value={value.day}
              onChange={(e) => onChange({ day: e.target.value })}
              required
            />
          </div>
        )}
        <div className="col-span-2">
          {label("Titel")}
          <input
            className="input"
            placeholder={compact ? "Titel" : undefined}
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            required
          />
        </div>
        <div>
          {label("Zielzone (Hauptbelastung)")}
          <select className="input" value={value.target_zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">{compact ? "Zone -" : "-"}</option>
            {TARGET_ZONE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {methodOptionsForZone(value.target_zone).length > 0 && (
          <div>
            {label("Methodik")}
            <select className="input" value={value.method} onChange={(e) => setMethod(e.target.value)}>
              {methodOptionsForZone(value.target_zone).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {durationMode ? (
          <div>
            {label("Dauer (Minuten)")}
            <input
              type="number"
              min={0}
              step="1"
              className="input"
              placeholder={compact ? "Minuten" : undefined}
              value={value.target_duration_min}
              onChange={(e) => onChange({ target_duration_min: e.target.value })}
            />
          </div>
        ) : (
          <div>
            {label("Zieldistanz (km)")}
            <input
              type="number"
              step="0.1"
              min={0}
              className="input disabled:opacity-50"
              disabled={segmentsVisible}
              placeholder={
                segmentsVisible
                  ? `${segmentsTotalKm(value.segments).toFixed(1)} (${compact ? "Segmente" : "aus Segmenten"})`
                  : compact
                    ? "km"
                    : undefined
              }
              value={value.target_distance_km}
              onChange={(e) => onChange({ target_distance_km: e.target.value })}
            />
          </div>
        )}
        {showTargetPace && value.target_zone === "GA1" && !segmentsVisible && (
          <div>
            {label("Ziel-Pace GA1 (mm:ss/km)")}
            <input
              type="text"
              placeholder={compact ? "Pace" : derivedGa1Pace ?? undefined}
              className="input"
              value={value.target_pace}
              onChange={(e) => onChange({ target_pace: e.target.value })}
            />
          </div>
        )}
      </div>

      {(!compact || value.title.trim().length > 0) &&
        (compact ? (
          <input
            className="input"
            placeholder="Notiz (optional)"
            value={value.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        ) : (
          <div>
            {label("Notiz")}
            <textarea
              className="input"
              rows={2}
              value={value.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </div>
        ))}

      {segmentsVisible &&
        (value.target_zone === "Schwelle" && value.method === "Fahrtspiel" ? (
          <FahrtspielEditor
            segments={value.segments}
            onChange={(segments) => onChange({ segments })}
            athleteZones={athleteZones}
            mode={mode}
          />
        ) : (
          <SegmentEditor
            segments={value.segments}
            onChange={(segments) => onChange({ segments })}
            athleteZones={athleteZones}
            athleteWattZones={athleteWattZones}
            mode={mode}
            targetZone={value.target_zone}
            sport={sport}
          />
        ))}
    </div>
  );
}
