"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { FahrtspielSegmentsView } from "@/components/FahrtspielSegmentsView";
import { RouteGuard } from "@/components/RouteGuard";
import { rangeFor, WeekMonthNav, type NavMode } from "@/components/WeekMonthNav";
import { getPlansOverview } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/lib/useMediaQuery";
import {
  daysInRange,
  formatDateDMY,
  formatDurationS,
  formatSegment,
  isNotableMethod,
  shortWeekdayLabel,
  todayLocalIso,
} from "@/lib/plan";
import type { AthletePlanOverview } from "@/types/training";

// Reihenfolge der Athletenspalten ist rein eine Anzeigepraeferenz des
// Trainers (kein Trainingsdatum) - daher per localStorage statt eines
// Backend-Felds persistiert, geraetegebunden analog zu anderen reinen
// UI-Praeferenzen.
const ORDER_STORAGE_KEY = "overview-athlete-order";

function applyOrder(list: AthletePlanOverview[], order: number[]): AthletePlanOverview[] {
  const byId = new Map(list.map((a) => [a.athlete_id, a]));
  const ordered: AthletePlanOverview[] = [];
  for (const id of order) {
    const athlete = byId.get(id);
    if (athlete) {
      ordered.push(athlete);
      byId.delete(id);
    }
  }
  // Neue/noch nie einsortierte Athleten haengen ans Ende, statt zu fehlen.
  return [...ordered, ...byId.values()];
}

// Trainer-Ansicht, die die Trainingsplaene aller Athleten fuer denselben
// Zeitraum nebeneinander zeigt - ohne diese Seite muesste der Trainer fuer
// denselben Ueberblick auf app/training-plan/page.tsx zwischen jedem
// Athleten einzeln wechseln (siehe Athletenauswahl dort).
function OverviewContent() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const [overview, setOverview] = useState<AthletePlanOverview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const mode: NavMode = searchParams.get("view") === "month" ? "month" : "week";
  const anchor = searchParams.get("anchor") ?? todayLocalIso();
  const range = rangeFor(mode, anchor);

  useEffect(() => {
    if (!token) return;
    setError(null);
    getPlansOverview(range, token)
      .then(setOverview)
      .catch(() => setError("Übersicht konnte nicht geladen werden"));
  }, [token, range.start, range.end]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_STORAGE_KEY);
      if (raw) setOrder(JSON.parse(raw));
    } catch {
      // Praeferenz einfach verwerfen (z.B. privates Browserfenster) -
      // die Spalten fallen dann auf die Backend-Reihenfolge zurueck.
    }
  }, []);

  const orderedOverview = order.length > 0 ? applyOrder(overview, order) : overview;

  function persistOrder(next: AthletePlanOverview[]) {
    const ids = next.map((a) => a.athlete_id);
    setOrder(ids);
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Reihenfolge gilt dann nur fuer diese Sitzung.
    }
  }

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const fromIndex = orderedOverview.findIndex((a) => a.athlete_id === dragId);
    const toIndex = orderedOverview.findIndex((a) => a.athlete_id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...orderedOverview];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistOrder(next);
    setDragId(null);
    setDragOverId(null);
  }

  function updateParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    router.push(`/overview?${params.toString()}`);
  }

  return (
    <main className="page max-w-[100rem] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Übersicht</h1>
        <WeekMonthNav
          mode={mode}
          anchor={anchor}
          onChange={(nextMode, nextAnchor) => updateParams({ view: nextMode, anchor: nextAnchor })}
        />
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : overview.length === 0 ? (
        <p className="text-sm text-mist">Lädt...</p>
      ) : (
        // Ein einziges CSS-Grid statt unabhaengiger Spalten pro Athlet: eine
        // Grid-Zeile pro Tag, in der Reihenfolge Tag-Label + je ein Kasten
        // pro Athlet - CSS Grid setzt die Zeilenhoehe automatisch auf den
        // hoechsten Kasten der Zeile, wodurch derselbe Tag in jeder Spalte
        // garantiert auf derselben Hoehe beginnt (unabhaengig davon, wie
        // viele Einheiten ein anderer Athlet an diesem Tag hat).
        // Auf dem Smartphone schmalere Athletenspalten (11rem statt 18rem)
        // und ein kompakteres Tagesfeld: die Ansicht vergleicht bewusst
        // mehrere Athleten nebeneinander und bleibt daher auch dort seitlich
        // scrollbar - mit Desktop-Spaltenbreiten passte allerdings nicht
        // einmal eine ganze Spalte ins Bild.
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `${isMobile ? "4.5rem" : "6rem"} repeat(${orderedOverview.length}, ${
                isMobile ? "11rem" : "18rem"
              })`,
            }}
          >
            <div />
            {orderedOverview.map((athlete) => {
              const totalKm = athlete.sessions.reduce((sum, s) => sum + (s.target_distance_km ?? 0), 0);
              const isDragging = dragId === athlete.athlete_id;
              const isDropTarget = dragOverId === athlete.athlete_id && dragId !== null && dragId !== athlete.athlete_id;
              return (
                <div
                  key={athlete.athlete_id}
                  draggable
                  onDragStart={(e) => {
                    // Browser nimmt sonst einen Screenshot des Originalelements als
                    // Drag-Bild, wodurch die Verkleinerung unten (scale-95) auch im
                    // Ghost-Bild sichtbar waere - stattdessen Standardbild verwenden
                    // und nur das Originalelement in der Liste animieren.
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(athlete.athlete_id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== athlete.athlete_id) setDragOverId(athlete.athlete_id);
                  }}
                  onDragLeave={() => {
                    setDragOverId((current) => (current === athlete.athlete_id ? null : current));
                  }}
                  onDrop={() => handleDrop(athlete.athlete_id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  title="Ziehen, um die Reihenfolge zu ändern"
                  className={`cursor-grab rounded-lg transition-all duration-150 ease-out active:cursor-grabbing ${
                    isDragging
                      ? "scale-95 rotate-1 opacity-50 shadow-lg ring-2 ring-moss/40"
                      : isDropTarget
                        ? "scale-[1.02] ring-2 ring-moss/60"
                        : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/training-plan?athlete_id=${athlete.athlete_id}`)}
                    className="flex w-full items-baseline justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:text-moss"
                  >
                    <span className="text-sm font-medium text-ink">{athlete.athlete_name}</span>
                    <span className="text-xs text-mist">{totalKm.toFixed(1)} km</span>
                  </button>
                </div>
              );
            })}

            {daysInRange(range.start, range.end).map((day) => (
              <OverviewDayRow key={day} day={day} overview={orderedOverview} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// Eine Grid-Zeile (Tag-Label + ein Kasten pro Athlet) als direkte Kinder
// des Grids in OverviewContent (siehe dort) - `display: contents` laesst
// diesen Wrapper selbst nicht ins Layout eingehen, nur seine Kinder zaehlen
// fuers Grid, sonst wuerde die Verschachtelung die Spaltenausrichtung
// brechen. Mehrere Einheiten desselben Tages landen in einem gemeinsamen
// Kasten (durch eine Trennlinie abgesetzt) statt in separaten Kaesten.
function OverviewDayRow({ day, overview }: { day: string; overview: AthletePlanOverview[] }) {
  return (
    <div style={{ display: "contents" }}>
      <div className="pt-1 text-xs text-mist">
        {shortWeekdayLabel(day)} {formatDateDMY(day)}
      </div>
      {overview.map((athlete) => {
        const sessions = athlete.sessions.filter((s) => s.day === day);
        return (
          <div key={athlete.athlete_id} className="rounded-lg border border-mist/15 bg-paper p-2 text-xs">
            {sessions.length === 0 ? (
              <p className="text-mist">–</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => (
                  <div key={s.id} className={i > 0 ? "border-t border-mist/10 pt-2" : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink">{s.title}</p>
                      {s.target_zone && (
                        <span className="badge bg-moss/15 text-moss">
                          {s.target_zone}
                          {isNotableMethod(s.target_zone, s.method) ? ` (${s.method})` : ""}
                        </span>
                      )}
                    </div>
                    {s.target_distance_km ? (
                      <p className="text-mist">{s.target_distance_km.toFixed(1)} km</p>
                    ) : s.target_duration_s ? (
                      <p className="text-mist">{formatDurationS(s.target_duration_s)}</p>
                    ) : null}
                    {s.segments.length > 0 &&
                      (s.method === "Fahrtspiel" ? (
                        <FahrtspielSegmentsView segments={s.segments} />
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-mist">
                          {s.segments.map((seg, j) => (
                            <li key={j}>{formatSegment(seg)}</li>
                          ))}
                        </ul>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <RouteGuard role={["trainer"]}>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <OverviewContent />
      </Suspense>
    </RouteGuard>
  );
}
