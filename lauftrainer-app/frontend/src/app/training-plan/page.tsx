"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { CopyPlanForm } from "@/components/CopyPlanForm";
import { MultiAthletePlanForm } from "@/components/MultiAthletePlanForm";
import { PlanProtokollDayRows } from "@/components/PlanProtokollDayRows";
import { RouteGuard } from "@/components/RouteGuard";
import { rangeFor, WeekMonthNav, type NavMode } from "@/components/WeekMonthNav";
import { ZoneSummaryChart } from "@/components/ZoneSummaryChart";
import { getActivities, getAthletes, getCalendarNotes, getTrainingPlan, getTrainingZones, getWellnessEntries } from "@/lib/api";
import { exportActivitiesPdf } from "@/lib/activityPdf";
import { addDays, daysInRange, mondayOf, todayLocalIso } from "@/lib/plan";
import { useAuth } from "@/lib/auth-context";
import type { Activity, AthleteSummary, CalendarNote, DailyWellness, PlannedSession, ZoneSummary } from "@/types/training";

// "Plan vs. Ist" gilt hier immer nur fuer die aktuelle Kalenderwoche
// (unabhaengig davon, welche Woche/welcher Monat gerade per WeekMonthNav
// angezeigt wird) - eigener, fester [start, end)-Bereich statt `range`.
function currentWeekRange(): { start: string; end: string } {
  const start = mondayOf(todayLocalIso());
  return { start, end: addDays(start, 7) };
}

// Athlet und Trainer sehen hier dieselbe Ansicht (PlanProtokollDayRows) -
// der Trainer bekommt zusaetzlich die Athletenauswahl oben sowie "Einheit
// fuer mehrere Athleten planen"/"Trainingsplan kopieren" darunter (siehe
// canManagePlan-Prop fuers Bearbeiten/Loeschen einzelner Einheiten).
// DanielsZoneTable/BakkenZoneTable (Trainingsbereiche) sind bewusst nicht
// mehr hier, sondern nur noch unter /profile (Athlet) bzw. /athletes
// (Trainer) - dieselbe Aufteilung wie beim Athleten selbst.
function TrainingPlanContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [wellnessEntries, setWellnessEntries] = useState<DailyWellness[]>([]);
  const [wellnessError, setWellnessError] = useState<string | null>(null);
  const [calendarNotes, setCalendarNotes] = useState<CalendarNote[]>([]);
  const [currentWeekZones, setCurrentWeekZones] = useState<ZoneSummary[] | null>(null);
  const [currentWeekZonesError, setCurrentWeekZonesError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const selectedAthleteId = searchParams.get("athlete_id")
    ? Number(searchParams.get("athlete_id"))
    : user?.id;
  const isTrainer = user?.role === "trainer";
  const mode: NavMode = searchParams.get("view") === "month" ? "month" : "week";
  const anchor = searchParams.get("anchor") ?? todayLocalIso();
  const range = rangeFor(mode, anchor);

  // Fuer einen Trainer kommen die Tempozonen aus der geladenen Athletenliste
  // (Punkt-Lookup, kein Extra-Request); schaut ein Athlet auf den eigenen
  // Plan, hat `user` selbst bereits alle noetigen Felder (siehe
  // types/training.ts:User vs. SegmentZoneInput).
  const selectedAthlete = isTrainer ? athletes.find((a) => a.id === selectedAthleteId) ?? null : user;

  // Bewusst in zwei Ladevorgaenge getrennt, weil sie an unterschiedlichen
  // Dingen haengen:
  //
  // `loadAthleteData` holt Plan und Protokoll als VOLLE Historie (die
  // Endpunkte kennen keinen Zeitraumfilter, gefiltert wird unten mit
  // visibleSessions/visibleActivities) sowie den Plan-vs-Ist-Abgleich, der
  // ohnehin immer die laufende Kalenderwoche zeigt (siehe currentWeekRange).
  // Nichts davon aendert sich beim Blaettern durch Wochen/Monate - haengte
  // es weiter mit am Zeitraum, luede jeder Klick in WeekMonthNav die
  // komplette Historie erneut herunter.
  //
  // `loadRangeData` holt die zeitraumgebundenen, kleinen Abfragen
  // (physiologische Daten, Jahresplaner-Notizen) und laeuft daher wirklich
  // bei jedem Zeitraumwechsel.
  const loadAthleteData = useCallback(() => {
    if (!token || !selectedAthleteId) return;
    getTrainingPlan(selectedAthleteId, token).then(setSessions);
    getActivities(selectedAthleteId, token).then(setActivities);
    setCurrentWeekZonesError(null);
    getTrainingZones(selectedAthleteId, currentWeekRange(), token)
      .then((res) => setCurrentWeekZones(res.zone_summary))
      .catch(() => setCurrentWeekZonesError("Plan vs. Ist konnte nicht geladen werden"));
  }, [token, selectedAthleteId]);

  const loadRangeData = useCallback(() => {
    if (!token || !selectedAthleteId) return;
    // Physiologische Daten erfasst nur der Athlet selbst, der Trainer sieht
    // sie aber (schreibgeschuetzt) in derselben Ansicht (siehe
    // PlanProtokollDayRows: wellness.readOnly) - daher fuer beide Rollen
    // laden.
    setWellnessError(null);
    getWellnessEntries(selectedAthleteId, range.start, range.end, token)
      .then(setWellnessEntries)
      .catch(() => setWellnessError("Physiologische Daten konnten nicht geladen werden"));
    if (isTrainer) {
      // Jahresplaner-Notizen (siehe app/year-planner/page.tsx) sind
      // Trainer-Anmerkungen zu einem Tag - beim Planen einer Einheit sollen
      // sie hier direkt sichtbar sein, ohne extra in den Jahresplaner
      // wechseln zu muessen. Fuer den Athleten selbst bleiben sie ungenutzt,
      // da nur der Trainer Einheiten plant.
      getCalendarNotes(selectedAthleteId, range.start, range.end, token)
        .then(setCalendarNotes)
        .catch(() => setCalendarNotes([]));
    }
  }, [token, selectedAthleteId, range.start, range.end, isTrainer]);

  // Nach einer Aenderung (Einheit geplant/bearbeitet/geloescht, Aktivitaet
  // protokolliert) wird weiterhin alles neu geladen - siehe onChanged.
  const loadAll = useCallback(() => {
    loadAthleteData();
    loadRangeData();
  }, [loadAthleteData, loadRangeData]);

  useEffect(() => {
    if (!user || !token || !isTrainer) return;
    getAthletes(token).then(setAthletes);
  }, [user, token, isTrainer]);

  // Ohne Athletenlisten-Einstiegspunkt (siehe Navbar.tsx) muss die Seite
  // selbst einen Athleten vorauswaehlen, sonst faellt selectedAthleteId
  // auf die eigene Trainer-ID zurueck und die Seite zeigt leere Daten.
  useEffect(() => {
    if (!isTrainer || searchParams.get("athlete_id") || athletes.length === 0) return;
    updateParams({ athlete_id: String(athletes[0].id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrainer, athletes, searchParams]);

  useEffect(() => {
    loadAthleteData();
  }, [loadAthleteData]);

  useEffect(() => {
    loadRangeData();
  }, [loadRangeData]);

  function updateParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    router.push(`/training-plan?${params.toString()}`);
  }

  const notesByDay = new Map(calendarNotes.filter((n) => n.note).map((n) => [n.day, n.note]));
  const visibleSessions = sessions.filter((s) => s.day >= range.start && s.day < range.end);
  const visibleActivities = activities.filter((a) => a.day >= range.start && a.day < range.end);
  const visibleDays = daysInRange(range.start, range.end);

  const selectClass = "select-inline";

  return (
    <main className="page max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Plan &amp; Protokoll</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isTrainer && (
            <select
              className={selectClass}
              value={selectedAthleteId ?? ""}
              onChange={(e) => updateParams({ athlete_id: e.target.value })}
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <WeekMonthNav
            mode={mode}
            anchor={anchor}
            onChange={(nextMode, nextAnchor) => updateParams({ view: nextMode, anchor: nextAnchor })}
          />
        </div>
      </div>

      {selectedAthleteId && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-mist">Plan &amp; Protokoll</h2>
            {visibleActivities.length > 0 && (
              <button
                type="button"
                // Asynchron, da jsPDF erst beim Klick nachgeladen wird
                // (siehe lib/activityPdf.ts).
                onClick={() => {
                  setPdfError(null);
                  exportActivitiesPdf(visibleActivities, selectedAthlete?.name).catch(() =>
                    setPdfError("PDF-Export konnte nicht geladen werden")
                  );
                }}
                className="text-xs text-moss transition-colors hover:underline"
              >
                Protokoll als PDF exportieren
              </button>
            )}
          </div>
          {/* Physiologische Daten erfasst nur der Athlet fuer sich selbst -
              der Trainer sieht dieselben Werte schreibgeschuetzt (readOnly).
              Als dritte Spalte je Tag statt eines separaten Blocks, damit der
              Kasten automatisch dieselbe Hoehe wie Plan/Protokoll desselben
              Tages bekommt (siehe PlanProtokollDayRows: wellness-Prop). */}
          {pdfError && <p className="text-sm text-danger">{pdfError}</p>}
          {wellnessError && <p className="text-sm text-danger">{wellnessError}</p>}
          <PlanProtokollDayRows
            days={visibleDays}
            sessions={visibleSessions}
            activities={visibleActivities}
            athleteId={selectedAthleteId}
            athleteZones={selectedAthlete}
            athleteWattZones={selectedAthlete}
            canManagePlan={isTrainer}
            notesByDay={isTrainer ? notesByDay : undefined}
            onChanged={loadAll}
            wellness={{ entries: wellnessEntries, onLogged: loadAll, readOnly: isTrainer }}
          />

          {isTrainer && (
            <section className="space-y-3">
              <CopyPlanForm targetAthleteId={selectedAthleteId} athletes={athletes} onChanged={loadAll} />
              <MultiAthletePlanForm athletes={athletes} onChanged={loadAll} />
            </section>
          )}

          {/* Ans Seitenende verschoben (siehe Kommentar oben bei
              currentWeekRange): reine Ist/Soll-Kontrolle, die Nutzer nach
              der eigentlichen Planung/Erfassung nachschlagen, nicht davor. */}
          {currentWeekZonesError && <p className="text-sm text-danger">{currentWeekZonesError}</p>}
          {currentWeekZones && <ZoneSummaryChart data={currentWeekZones} />}
        </>
      )}
    </main>
  );
}

export default function TrainingPlanPage() {
  return (
    <RouteGuard>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <TrainingPlanContent />
      </Suspense>
    </RouteGuard>
  );
}
