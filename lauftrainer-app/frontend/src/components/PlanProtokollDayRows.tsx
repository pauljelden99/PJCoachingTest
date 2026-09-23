"use client";

import { useState } from "react";

import { ActivityCard, SOURCE_LABEL } from "@/components/ActivityCard";
import { ActivityEditForm } from "@/components/ActivityEditForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DailyWellnessForm } from "@/components/DailyWellnessForm";
import { FahrtspielSegmentsView } from "@/components/FahrtspielSegmentsView";
import { ManualActivityForm } from "@/components/ManualActivityForm";
import {
  buildPlanSessionPayload,
  emptyPlanSessionValue,
  planSessionValueFromSession,
  PlanSessionFields,
  type PlanSessionValue,
} from "@/components/PlanSessionFields";
import { ApiError, createPlannedSession, deleteActivity, deletePlannedSession, updatePlannedSession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatHoursMinutes, formatSleepDuration } from "@/lib/format";
import { useIsBelowDesktop, useIsMobile } from "@/lib/useMediaQuery";
import {
  bareZone,
  formatDateDMY,
  formatDurationS,
  formatSegment,
  formatWeekRange,
  groupDaysByWeek,
  indexByDay,
  isNotableMethod,
  OTHER_ZONES,
  segmentsKmByZone,
  shortWeekdayLabel,
} from "@/lib/plan";
import type { SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { Activity, DailyWellness, PlannedSession } from "@/types/training";

function PlanItemView({
  session,
  onEdit,
  onDelete,
}: {
  session: PlannedSession;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  // Standardmaessig eingeklappt - nur Titel und Zielzone sichtbar, alle
  // weiteren Angaben (Distanz/Dauer/Segmente/Notiz) erst nach Ausklappen,
  // analog zu ActivityCard.tsx (protokollierte Einheiten).
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-surface/60 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex flex-wrap items-center gap-2 text-left">
          <span className="text-xs text-mist">{expanded ? "▾" : "▸"}</span>
          <span className="text-sm font-medium text-ink">{session.title}</span>
          {session.target_zone && (
            <span className="badge bg-moss/15 text-moss">
              {session.target_zone}
              {isNotableMethod(session.target_zone, session.method) ? ` (${session.method})` : ""}
            </span>
          )}
        </button>
        {(onEdit || onDelete) && (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            {onEdit && (
              <button onClick={onEdit} className="link-action">
                Bearbeiten
              </button>
            )}
            {onEdit && onDelete && " · "}
            {onDelete && (
              <button onClick={onDelete} className="text-danger transition-colors hover:underline">
                Löschen
              </button>
            )}
          </span>
        )}
      </div>
      {expanded && (
        <>
          {(session.target_distance_km || session.target_duration_s) && (
            <div className="mt-1 text-xs text-mist">
              {session.target_distance_km
                ? `${session.target_distance_km.toFixed(1)} km`
                : formatDurationS(session.target_duration_s!)}
            </div>
          )}
          {session.segments.length > 0 &&
            (session.method === "Fahrtspiel" ? (
              <FahrtspielSegmentsView segments={session.segments} />
            ) : (
              <div className="mt-1.5 space-y-0.5">
                {session.segments.map((segment, i) => (
                  <p key={i} className="text-xs text-mist">
                    {formatSegment(segment)}
                  </p>
                ))}
              </div>
            ))}
          {session.description && <p className="mt-1.5 text-xs text-mist">{session.description}</p>}
        </>
      )}
    </div>
  );
}

// Kompakte Einzeiler-Anzeige physiologischer Tageswerte (Ruhepuls/HRV/
// Schlaf), analog zu den eingeklappten Plan-/Protokoll-Kaesten (PlanItemView/
// ActivityCard) - anstelle des immer offenen Formulars, solange nicht
// gerade per "+ Erfassen" bearbeitet wird (siehe unten).
function WellnessSummary({ entry }: { entry: DailyWellness | null }) {
  if (!entry || (entry.resting_hr == null && entry.hrv == null && entry.sleep_duration_h == null && entry.sleep_quality == null)) {
    return <p className="text-xs text-mist">Keine Angaben.</p>;
  }
  const parts: string[] = [];
  if (entry.resting_hr != null) parts.push(`Ruhepuls ${entry.resting_hr} bpm`);
  if (entry.hrv != null) parts.push(`HRV ${entry.hrv} ms`);
  if (entry.sleep_duration_h != null) {
    parts.push(`Schlaf ${formatSleepDuration(entry.sleep_duration_h)}${entry.sleep_quality != null ? ` (${entry.sleep_quality}/10)` : ""}`);
  } else if (entry.sleep_quality != null) {
    parts.push(`Schlafqualität ${entry.sleep_quality}/10`);
  }
  return <p className="text-xs text-mist">{parts.join(" · ")}</p>;
}

// Huelle um die Kaesten EINES Tages. Auf dem breiten Bildschirm sind das
// die nebeneinanderliegenden Zellen einer Rasterzeile (schmale Datumsspalte
// + Plan + Protokoll + optional Physio, siehe PlanProtokollDayRows unten);
// auf schmalen Geraeten (`stacked`) stattdessen EINE Karte je Tag mit dem
// Datum als Ueberschrift und den Abschnitten untereinander - drei bis vier
// Spalten nebeneinander waeren dort unbrauchbar schmal.
function DayGroup({
  stacked,
  dayLabel,
  children,
}: {
  stacked: boolean;
  dayLabel: string;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <div className="space-y-3 rounded-xl border border-mist/15 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-mist">{dayLabel}</div>
        {children}
      </div>
    );
  }
  return (
    <>
      {/* Eigene, schmale Datumsspalte statt des bisher in jeder Spalte
          (Plan/Protokoll/Physio) wiederholten Datums - an einer Stelle
          statt bis zu dreimal je Tag. */}
      <div className="flex items-start justify-center pt-3 text-center text-xs font-medium uppercase tracking-wide text-mist">
        {dayLabel}
      </div>
      {children}
    </>
  );
}

// Ein Abschnitt innerhalb eines Tages (Plan/Protokoll/Physio): auf dem
// breiten Bildschirm ein eigener umrandeter Kasten der Rasterzeile, sonst
// ein beschrifteter Abschnitt innerhalb der Tageskarte - dort traegt bereits
// die Karte den Rahmen, und ohne Ueberschrift waeren die untereinander
// gestapelten Abschnitte nicht mehr auseinanderzuhalten.
function DayCell({
  stacked,
  title,
  action,
  children,
}: {
  stacked: boolean;
  title: string;
  // Die "+ Planen"/"+ Erfassen"-Schaltflaeche des Abschnitts - bewusst als
  // eigene Prop statt als erstes Kind, damit sie auf schmalen Geraeten
  // neben der Abschnittsueberschrift Platz findet, statt je Abschnitt eine
  // eigene Zeile zu belegen.
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-mist/80">{title}</h4>
          {action}
        </div>
        {children}
      </section>
    );
  }
  return (
    <div className="rounded-xl border border-mist/15 p-3">
      {action && <div className="mb-2 flex items-center justify-end">{action}</div>}
      {children}
    </div>
  );
}

// Gemeinsame Ansicht von Plan & Protokoll fuer Athlet UND Trainer: eine
// Zeile pro Tag mit Plan links und Protokoll rechts (optional physiologische
// Daten als dritte Spalte, siehe wellness-Prop), ueber ein CSS-Grid statt
// unabhaengiger Listen - dadurch stehen alle Kaesten desselben Tages dank
// nativer Grid-Zeilenhoehe (align-items: stretch, Standardverhalten)
// automatisch auf gleicher Hoehe, ohne dass sie je Tag gleich viel Inhalt
// haben muessten. Jedes DayGroup traegt genau die Zellen eines Tages bei
// (zwei ohne, drei mit wellness-Prop), die das Grid dann selbst zu einer
// Zeile zusammenfasst (Reihenfolge: Plan Tag 1, Protokoll Tag 1, [Physio Tag
// 1], Plan Tag 2, ...). Auf dem Smartphone entfaellt das Nebeneinander
// zugunsten einer Karte je Tag - siehe DayGroup/DayCell oben.
export function PlanProtokollDayRows({
  days,
  sessions,
  activities,
  athleteId,
  athleteZones = null,
  athleteWattZones = null,
  canManagePlan = false,
  notesByDay,
  onChanged,
  wellness,
}: {
  days: string[];
  sessions: PlannedSession[];
  activities: Activity[];
  athleteId: number;
  athleteZones?: SegmentZoneInput | null;
  athleteWattZones?: WattZoneInput | null;
  // Jahresplaner-Anmerkung des Trainers zu diesem Tag (siehe
  // app/year-planner/page.tsx) - nur uebergeben, wenn sie beim Planen
  // angezeigt werden soll (aktuell nur fuer den Trainer, siehe
  // app/training-plan/page.tsx).
  notesByDay?: Map<string, string>;
  // Anlegen/Bearbeiten/Loeschen einzelner geplanter Einheiten ist dem
  // Trainer vorbehalten (siehe backend/app/api/training_plans.py) - der
  // Athlet sieht den Plan weiterhin nur lesend, protokolliert aber wie
  // gehabt seine tatsaechlich absolvierten Einheiten rechts daneben.
  // Ergaenzend dazu gibt es "Einheit fuer mehrere Athleten planen"/
  // "Trainingsplan kopieren" (siehe app/training-plan/page.tsx) fuer
  // Einheiten, die mehrere Athleten oder ganze Zeitraeume betreffen.
  canManagePlan?: boolean;
  onChanged: () => void;
  // Physiologische Daten (Ruhepuls/HRV/Schlaf) als dritte Spalte je Tag,
  // in derselben Zeile wie Plan und Protokoll dieses Tages - fuer den
  // Athleten selbst editierbar, fuer den Trainer nur lesend (readOnly:
  // true), damit er die Werte seiner Athleten einsehen, aber nicht
  // stellvertretend eintragen kann (siehe app/training-plan/page.tsx).
  // Dank desselben Grids wie Plan/Protokoll (ein DayGroup pro Tag, siehe
  // Kommentar unten) passt sich die Kastenhoehe automatisch der Zeile an,
  // ganz ohne manuelle Hoehenberechnung.
  wellness?: {
    entries: DailyWellness[];
    onLogged: () => void;
    readOnly?: boolean;
  };
}) {
  const { token } = useAuth();
  // Gestapeltes Layout: eine Karte je Tag statt einer Rasterzeile mit
  // mehreren Spalten (siehe DayGroup/DayCell oben). Bewusst ueber eine
  // Media-Query statt ueber hidden/md:block-Klassen, da sonst beide
  // Varianten samt ihrer Formulare gleichzeitig im DOM haengen wuerden
  // (doppelter State, doppelte Eingabefelder) - siehe lib/useMediaQuery.ts.
  // Mit Physio-Spalte braucht die Zeile vier Spalten und damit Laptop-
  // Breite, ohne sie reicht schon ein Tablet - die Umschaltpunkte muessen
  // exakt zu den md:/lg:-Klassen des Rasters unten passen, sonst laufen je
  // Tag mehr Zellen an als die Zeile Spalten hat und das Raster verrutscht.
  const isStackedWithoutWellness = useIsMobile();
  const isStackedWithWellness = useIsBelowDesktop();
  const isStacked = wellness ? isStackedWithWellness : isStackedWithoutWellness;
  // Nur ein Erfassen-Formular bzw. eine Bearbeitung gleichzeitig offen,
  // ueber alle Tage hinweg - analog zu ManualActivityDayBoxes/ActivityList.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [sessionForm, setSessionForm] = useState<PlanSessionValue | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<PlannedSession | null>(null);
  // Tag, fuer den gerade eine neue Einheit angelegt wird (analog zu
  // `openDay` fuers Protokollieren einer Aktivitaet) - nur eines
  // gleichzeitig offen, ueber alle Tage hinweg.
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [newSessionForm, setNewSessionForm] = useState<PlanSessionValue | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Analog zu openDay/planningDay: physiologische Daten sind standardmaessig
  // nur kompakt zusammengefasst (siehe WellnessSummary), das Formular oeffnet
  // sich erst per "+ Erfassen".
  const [openWellnessDay, setOpenWellnessDay] = useState<string | null>(null);

  function startEditSession(session: PlannedSession) {
    setEditingSessionId(session.id);
    setSessionForm(planSessionValueFromSession(session));
  }

  function cancelEditSession() {
    setEditingSessionId(null);
    setSessionForm(null);
  }

  async function handleSessionEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !sessionForm || editingSessionId === null) return;
    setSavingSession(true);
    setError(null);
    try {
      await updatePlannedSession(editingSessionId, buildPlanSessionPayload(sessionForm), token);
      cancelEditSession();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Einheit konnte nicht gespeichert werden");
    } finally {
      setSavingSession(false);
    }
  }

  function startPlanSession(day: string) {
    setPlanningDay(day);
    setNewSessionForm(emptyPlanSessionValue(day));
  }

  function cancelPlanSession() {
    setPlanningDay(null);
    setNewSessionForm(null);
  }

  async function handleSessionCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newSessionForm) return;
    setCreatingSession(true);
    setError(null);
    try {
      await createPlannedSession(athleteId, buildPlanSessionPayload(newSessionForm), token);
      cancelPlanSession();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Einheit konnte nicht angelegt werden");
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleDeleteSession(session: PlannedSession) {
    if (!token) return;
    setError(null);
    try {
      await deletePlannedSession(session.id, token);
      if (editingSessionId === session.id) cancelEditSession();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Einheit konnte nicht gelöscht werden");
    }
  }

  async function handleDelete(a: Activity) {
    if (!token) return;
    setDeletingId(a.id);
    setError(null);
    try {
      await deleteActivity(a.id, token);
      if (editingActivityId === a.id) setEditingActivityId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aktivität konnte nicht gelöscht werden");
    } finally {
      setDeletingId(null);
    }
  }

  // Einmal je Tag indexieren statt pro Tag und pro Woche erneut durch die
  // vollen Listen zu filtern (siehe indexByDay in lib/plan.ts): die Ansicht
  // rendert bis zu 31 Tageszeilen und lief vorher fuer jede davon einmal
  // ueber saemtliche Einheiten und Aktivitaeten des Zeitraums - und das bei
  // jedem Tastendruck in einem der Formulare, die in derselben Komponente
  // haengen.
  const sessionsByDay = indexByDay(sessions);
  const activitiesByDay = indexByDay(activities);
  const wellnessByDay = indexByDay(wellness?.entries ?? []);

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}
      {groupDaysByWeek(days).map((week) => {
        const weekSessions = week.days.flatMap((d) => sessionsByDay.get(d) ?? []);
        const weekActivities = week.days.flatMap((d) => activitiesByDay.get(d) ?? []);
        const plannedKm = weekSessions.reduce((sum, s) => sum + (s.target_distance_km ?? 0), 0);
        const actualKm = weekActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000;
        // Aufschluesselung der geplanten Kilometer nach blosser Zone
        // (GA1/Schwelle/VO2max/Sprint-Reps), sportartuebergreifend (Laufen/
        // Radfahren/Schwimmen teilen sich dieselben Intensitaetsstufen,
        // siehe bareZone in lib/plan.ts) - ergaenzt die reine Gesamtsumme
        // oben. "Sprint/Reps" zaehlt hier mit (frueher fehlte die Zone
        // sowohl bei zielzonen- als auch bei segmentbasierten Sprint-
        // Einheiten komplett in dieser Aufschluesselung, obwohl ihre
        // Distanz bereits in plannedKm oben eingerechnet war - die Summe
        // der vier Zonen stimmte dadurch nicht mit der Gesamtsumme
        // ueberein). Bei strukturierten Einheiten (Segmente vorhanden) wird
        // pro Abschnitt gezaehlt (Aufwaermen=GA1, Intervall=Schwelle/
        // Sprint-Reps, ...) statt die gesamte Distanz der Zielzone
        // zuzuschlagen - exakt wie beim Backend-Pendant fuer protokollierte
        // Einheiten (services/zone_classifier.py:zone_km_from_target), damit
        // Plan und Protokoll gleich gerechnet werden.
        const plannedByZone = { GA1: 0, Schwelle: 0, VO2max: 0, "Sprint/Reps": 0 };
        for (const s of weekSessions) {
          if (!s.target_distance_km) continue;
          const zone = bareZone(s.target_zone);
          if (zone !== "GA1" && zone !== "Schwelle" && zone !== "VO2max" && zone !== "Sprint/Reps") continue;
          const segmentZoneKm = s.segments.length > 0 ? segmentsKmByZone(s.segments) : {};
          if (Object.keys(segmentZoneKm).length > 0) {
            for (const [segZone, km] of Object.entries(segmentZoneKm)) {
              if (segZone === "GA1" || segZone === "Schwelle" || segZone === "VO2max" || segZone === "Sprint/Reps") {
                plannedByZone[segZone] += km;
              }
            }
          } else {
            plannedByZone[zone] += s.target_distance_km;
          }
        }
        // Geplante Dauer der "Sonstiges"-Einheitstypen (Athletik/
        // Beweglichkeit/Krafttraining, siehe OTHER_ZONES) - diese laufen
        // ueber target_duration_s statt target_distance_km (s.o.) und
        // tauchen daher in plannedKm/plannedByZone gar nicht auf, obwohl sie
        // einen relevanten Teil der Wochenplanung ausmachen koennen.
        const plannedOtherMinutes =
          weekSessions
            .filter((s) => OTHER_ZONES.includes(s.target_zone ?? ""))
            .reduce((sum, s) => sum + (s.target_duration_s ?? 0), 0) / 60;

        return (
          <div key={week.weekStart} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-mist">
                Woche {formatWeekRange(week.weekStart)}
              </span>
              <span className="text-xs text-mist">
                Geplant: {plannedKm.toFixed(1)} km (GA1 {plannedByZone.GA1.toFixed(1)} · Schwelle{" "}
                {plannedByZone.Schwelle.toFixed(1)} · VO2max {plannedByZone.VO2max.toFixed(1)}
                {plannedByZone["Sprint/Reps"] > 0 && ` · Sprint/Reps ${plannedByZone["Sprint/Reps"].toFixed(1)}`})
                {plannedOtherMinutes > 0 && ` · Sonstiges ${formatHoursMinutes(plannedOtherMinutes)} h`} · Absolviert:{" "}
                {actualKm.toFixed(1)} km
              </span>
            </div>
            <div
              className={`grid grid-cols-1 gap-3 ${
                wellness ? "lg:grid-cols-[3.5rem_1fr_1fr_1fr]" : "md:grid-cols-[3.5rem_1fr_1fr]"
              }`}
            >
              {week.days.map((day) => {
                const daySessions = sessionsByDay.get(day) ?? [];
                const dayActivities = activitiesByDay.get(day) ?? [];
                const dayLabel = `${shortWeekdayLabel(day)} ${formatDateDMY(day)}`;
                const dayNote = notesByDay?.get(day);
                // Pro (Athlet, Tag) gibt es hoechstens einen Wellness-Eintrag
                // (UniqueConstraint, siehe backend/app/models/daily_wellness.py).
                const dayWellness = wellnessByDay.get(day)?.[0];

                return (
                  <DayGroup key={day} stacked={isStacked} dayLabel={dayLabel}>
                    <DayCell
                      stacked={isStacked}
                      title="Plan"
                      action={
                        canManagePlan && !(planningDay === day && newSessionForm) ? (
                          <button
                            type="button"
                            onClick={() => startPlanSession(day)}
                            className="rounded-full border border-dashed border-mist/30 px-2 py-0.5 text-[11px] text-mist transition-colors hover:border-moss hover:text-moss"
                          >
                            + Planen
                          </button>
                        ) : null
                      }
                    >
                      {dayNote && (
                        <p className="mb-2 rounded-lg bg-clay/10 p-2 text-xs text-clay">
                          <span className="font-medium">Jahresplaner-Notiz:</span> {dayNote}
                        </p>
                      )}
                      {daySessions.length === 0 ? (
                        <p className="text-xs text-mist">Keine Einheit geplant.</p>
                      ) : (
                        <div className="space-y-2">
                          {daySessions.map((s) =>
                            canManagePlan && editingSessionId === s.id && sessionForm ? (
                              <form
                                key={s.id}
                                onSubmit={handleSessionEditSubmit}
                                className="space-y-2 rounded-lg border border-moss/30 bg-paper/60 p-2"
                              >
                                <PlanSessionFields
                                  value={sessionForm}
                                  onChange={(patch) => setSessionForm({ ...sessionForm, ...patch })}
                                  athleteZones={athleteZones}
                                  athleteWattZones={athleteWattZones}
                                  compact
                                />
                                <div className="flex items-center gap-3">
                                  <button type="submit" disabled={savingSession} className="btn-primary">
                                    Speichern
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditSession}
                                    className="text-sm text-mist transition-colors hover:text-ink"
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <PlanItemView
                                key={s.id}
                                session={s}
                                onEdit={canManagePlan ? () => startEditSession(s) : undefined}
                                onDelete={canManagePlan ? () => setPendingDeleteSession(s) : undefined}
                              />
                            )
                          )}
                        </div>
                      )}
                      {canManagePlan && planningDay === day && newSessionForm && (
                        <form
                          onSubmit={handleSessionCreateSubmit}
                          className="mt-2 space-y-2 rounded-lg border border-moss/30 bg-paper/60 p-2"
                        >
                          <PlanSessionFields
                            value={newSessionForm}
                            onChange={(patch) => setNewSessionForm({ ...newSessionForm, ...patch })}
                            athleteZones={athleteZones}
                            athleteWattZones={athleteWattZones}
                            compact
                          />
                          <div className="flex items-center gap-3">
                            <button type="submit" disabled={creatingSession} className="btn-primary">
                              Anlegen
                            </button>
                            <button
                              type="button"
                              onClick={cancelPlanSession}
                              className="text-sm text-mist transition-colors hover:text-ink"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </form>
                      )}
                    </DayCell>

                    <DayCell
                      stacked={isStacked}
                      title="Protokoll"
                      action={
                        openDay !== day ? (
                          <button
                            type="button"
                            onClick={() => setOpenDay(day)}
                            className="rounded-full border border-dashed border-mist/30 px-2 py-0.5 text-[11px] text-mist transition-colors hover:border-moss hover:text-moss"
                          >
                            + Erfassen
                          </button>
                        ) : null
                      }
                    >
                      <div className="space-y-2">
                        {dayActivities.length > 0 && (
                          <div className="space-y-2">
                            {dayActivities.map((a) =>
                              editingActivityId === a.id ? (
                                <ActivityEditForm
                                  key={a.id}
                                  activity={a}
                                  athleteZones={athleteZones}
                                  athleteWattZones={athleteWattZones}
                                  onSaved={() => {
                                    setEditingActivityId(null);
                                    onChanged();
                                  }}
                                  onCancel={() => setEditingActivityId(null)}
                                />
                              ) : (
                                <ActivityCard
                                  key={a.id}
                                  activity={a}
                                  onEdit={() => setEditingActivityId(a.id)}
                                  onDelete={() => setPendingDelete(a)}
                                  deleting={deletingId === a.id}
                                />
                              )
                            )}
                          </div>
                        )}
                        {openDay === day && (
                          <ManualActivityForm
                            day={day}
                            athleteId={athleteId}
                            athleteZones={athleteZones}
                            athleteWattZones={athleteWattZones}
                            plannedSessions={sessions}
                            onCancel={() => setOpenDay(null)}
                            onLogged={() => {
                              setOpenDay(null);
                              onChanged();
                            }}
                          />
                        )}
                      </div>
                    </DayCell>

                    {wellness && (
                      <DayCell
                        stacked={isStacked}
                        title="Physiologische Daten"
                        action={
                          !wellness.readOnly && openWellnessDay !== day ? (
                            <button
                              type="button"
                              onClick={() => setOpenWellnessDay(day)}
                              className="rounded-full border border-dashed border-mist/30 px-2 py-0.5 text-[11px] text-mist transition-colors hover:border-moss hover:text-moss"
                            >
                              + Erfassen
                            </button>
                          ) : null
                        }
                      >
                        {wellness.readOnly || openWellnessDay !== day ? (
                          <WellnessSummary entry={dayWellness ?? null} />
                        ) : (
                          <>
                            <DailyWellnessForm
                              day={day}
                              athleteId={athleteId}
                              entry={dayWellness ?? null}
                              onSaved={wellness.onLogged}
                              readOnly={wellness.readOnly}
                            />
                            <button
                              type="button"
                              onClick={() => setOpenWellnessDay(null)}
                              className="mt-2 text-xs text-mist transition-colors hover:text-ink"
                            >
                              Fertig
                            </button>
                          </>
                        )}
                      </DayCell>
                    )}
                  </DayGroup>
                );
              })}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={pendingDelete !== null}
        message={
          pendingDelete
            ? `${pendingDelete.title || SOURCE_LABEL[pendingDelete.source] || pendingDelete.source} vom ${formatDateDMY(pendingDelete.day)} wirklich unwiderruflich löschen?`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const a = pendingDelete;
          setPendingDelete(null);
          if (a) handleDelete(a);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteSession !== null}
        message={
          pendingDeleteSession
            ? `${pendingDeleteSession.title || "Einheit"} vom ${formatDateDMY(pendingDeleteSession.day)} wirklich löschen?`
            : ""
        }
        onCancel={() => setPendingDeleteSession(null)}
        onConfirm={() => {
          const s = pendingDeleteSession;
          setPendingDeleteSession(null);
          if (s) handleDeleteSession(s);
        }}
      />
    </div>
  );
}
