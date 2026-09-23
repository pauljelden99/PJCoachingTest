"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RouteGuard } from "@/components/RouteGuard";
import { YearMonthGrid } from "@/components/YearMonthGrid";
import { getActivities, getAthletes, getCalendarNotes, getTrainingPlan, upsertCalendarNote } from "@/lib/api";
import { MONTH_LABELS } from "@/lib/plan";
import { useAuth } from "@/lib/auth-context";
import type { Activity, AthleteSummary, CalendarNote, PlannedSession } from "@/types/training";

type CalendarView = "year" | "month";

function formatDayHeading(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTimestamp(iso: string): string {
  // Backend liefert einen naiven UTC-Zeitstempel (datetime.utcnow(), kein
  // "Z"-Suffix) - ohne den Zusatz wuerde new Date() den String faelschlich
  // als lokale Zeit interpretieren.
  const withZone = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(withZone).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function YearPlannerContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAthleteId = searchParams.get("athlete_id")
    ? Number(searchParams.get("athlete_id"))
    : user?.id;
  const isTrainer = user?.role === "trainer";
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : new Date().getFullYear();
  const view: CalendarView = searchParams.get("view") === "month" ? "month" : "year";
  const month = searchParams.get("month") ? Number(searchParams.get("month")) - 1 : new Date().getMonth();

  const loadNotes = useCallback(() => {
    if (!token || !selectedAthleteId) return;
    setError(null);
    getCalendarNotes(selectedAthleteId, `${year}-01-01`, `${year + 1}-01-01`, token)
      .then(setNotes)
      .catch(() => setError("Notizen konnten nicht geladen werden"));
  }, [token, selectedAthleteId, year]);

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
    if (!token || !selectedAthleteId) return;
    getTrainingPlan(selectedAthleteId, token).then(setSessions);
    getActivities(selectedAthleteId, token).then(setActivities);
  }, [token, selectedAthleteId]);

  useEffect(() => {
    loadNotes();
    setSelectedDay(null);
  }, [loadNotes]);

  function updateParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    router.push(`/year-planner?${params.toString()}`);
  }

  const notedDays = useMemo(() => new Set(notes.filter((n) => n.note).map((n) => n.day)), [notes]);
  const notesByDay = useMemo(() => new Map(notes.filter((n) => n.note).map((n) => [n.day, n.note])), [notes]);
  const sessionDays = useMemo(
    () => new Set(sessions.filter((s) => s.day.startsWith(`${year}`)).map((s) => s.day)),
    [sessions, year]
  );
  const activityDays = useMemo(
    () => new Set(activities.filter((a) => a.day.startsWith(`${year}`)).map((a) => a.day)),
    [activities, year]
  );

  // Wechselt in der Monatsansicht einen Monat weiter/zurueck und traegt
  // dabei einen Jahreswechsel an den Raendern (Dez -> Jan, Jan -> Dez) in
  // den `year`-Parameter nach, an dem auch die Notizen haengen (siehe
  // loadNotes oben).
  function stepMonth(direction: 1 | -1) {
    let nextMonth = month + direction;
    let nextYear = year;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    updateParams({ view: "month", year: String(nextYear), month: String(nextMonth + 1) });
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    setDraftText(notes.find((n) => n.day === day)?.note ?? "");
  }

  async function handleSave() {
    if (!token || !selectedAthleteId || !selectedDay) return;
    setSaving(true);
    try {
      const updated = await upsertCalendarNote(selectedAthleteId, selectedDay, draftText, token);
      setNotes((prev) => {
        const others = prev.filter((n) => n.day !== selectedDay);
        return updated.note ? [...others, updated] : others;
      });
    } catch {
      setError("Notiz konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  const selectedNote = selectedDay ? notes.find((n) => n.day === selectedDay) ?? null : null;
  const dayPlan = selectedDay ? sessions.filter((s) => s.day === selectedDay) : [];
  const dayActivities = selectedDay ? activities.filter((a) => a.day === selectedDay) : [];

  const selectClass = "select-inline";

  return (
    <main className="page max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Jahresplaner</h1>
        </div>
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
          <div className="flex overflow-hidden rounded-full border border-mist/20">
            <button
              type="button"
              onClick={() => updateParams({ view: "year" })}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                view === "year" ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
              }`}
            >
              Jahr
            </button>
            <button
              type="button"
              onClick={() => updateParams({ view: "month" })}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                view === "month" ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
              }`}
            >
              Monat
            </button>
          </div>
          {view === "year" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateParams({ year: String(year - 1) })}
                aria-label="Vorjahr"
                className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
              >
                ◀
              </button>
              <span className="min-w-[3rem] text-center text-sm text-ink">{year}</span>
              <button
                type="button"
                onClick={() => updateParams({ year: String(year + 1) })}
                aria-label="Folgejahr"
                className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
              >
                ▶
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                aria-label="Vormonat"
                className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
              >
                ◀
              </button>
              <span className="min-w-[8rem] text-center text-sm text-ink">
                {MONTH_LABELS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => stepMonth(1)}
                aria-label="Folgemonat"
                className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
              >
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className={view === "year" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : ""}>
          {view === "year" ? (
            Array.from({ length: 12 }, (_, m) => (
              <YearMonthGrid
                key={m}
                year={year}
                month={m}
                notedDays={notedDays}
                sessionDays={sessionDays}
                activityDays={activityDays}
                selectedDay={selectedDay}
                onSelectDay={selectDay}
              />
            ))
          ) : (
            <YearMonthGrid
              year={year}
              month={month}
              notedDays={notedDays}
              sessionDays={sessionDays}
              activityDays={activityDays}
              selectedDay={selectedDay}
              onSelectDay={selectDay}
              notesByDay={notesByDay}
              size="large"
            />
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          {selectedDay ? (
            <div className="card space-y-3">
              <h3 className="text-sm font-medium text-ink">{formatDayHeading(selectedDay)}</h3>

              {dayPlan.length > 0 && (
                <div className="space-y-1 text-xs text-mist">
                  <span className="font-medium text-clay">Geplant:</span>
                  {dayPlan.map((s) => (
                    <p key={s.id}>{s.title}</p>
                  ))}
                </div>
              )}
              {dayActivities.length > 0 && (
                <div className="space-y-1 text-xs text-mist">
                  <span className="font-medium text-moss">Absolviert:</span>
                  {dayActivities.map((a) => (
                    <p key={a.id}>{a.distance_m != null ? `${(a.distance_m / 1000).toFixed(1)} km` : a.title || "Training"}</p>
                  ))}
                </div>
              )}

              <textarea
                className="input"
                rows={6}
                placeholder="Anmerkung für diesen Tag..."
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              {selectedNote?.updated_by_name && selectedNote.updated_at && (
                <p className="text-xs text-mist">
                  Zuletzt bearbeitet von {selectedNote.updated_by_name} am {formatTimestamp(selectedNote.updated_at)}
                </p>
              )}
              <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
                Speichern
              </button>
            </div>
          ) : (
            <div className="card text-sm text-mist">Tag auswählen, um eine Anmerkung zu schreiben.</div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function YearPlannerPage() {
  return (
    <RouteGuard>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <YearPlannerContent />
      </Suspense>
    </RouteGuard>
  );
}
