"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { ActivityList } from "@/components/ActivityList";
import { PeriodStatsTable } from "@/components/PeriodStatsTable";
import { RouteGuard } from "@/components/RouteGuard";
import { Vo2maxChart } from "@/components/Vo2maxChart";
import { WeeklyVolumeChart } from "@/components/WeeklyVolumeChart";
import { WeeklyZoneComparisonChart } from "@/components/WeeklyZoneComparisonChart";
import { WellnessCharts } from "@/components/WellnessCharts";
import { WorkloadRiskChart } from "@/components/WorkloadRiskChart";
import { ZoneDistribution } from "@/components/ZoneDistribution";
import { getActivities, getAnalytics, getAthletes, getTrainingZones, getWellnessSeries } from "@/lib/api";
import { addDays, addMonths, firstOfMonth, todayLocalIso } from "@/lib/plan";
import { useAuth } from "@/lib/auth-context";
import type {
  Activity,
  AnalyticsResponse,
  AthleteSummary,
  TrainingZonesResponse,
  WellnessSeriesResponse,
} from "@/types/training";

// Zeitraum-Auswahl fuers Dashboard: rollierende 60-Tage-/12-Monats-Fenster
// oder ein festes Kalenderjahr - alle Modi loesen sich in ein {start, end}-
// Fenster auf, das an getAnalytics/getTrainingZones/getWellnessSeries
// durchgereicht wird und alle Graphen (inkl. "Trainingserfüllung")
// gleichermassen steuert. Die einzelne Monatsauswahl wurde bewusst entfernt
// zugunsten dieser groberen, weniger klickintensiven Zeitraeume.
type PeriodMode = "last60" | "last12m" | "year";

function last60DaysRange(): { start: string; end: string } {
  const today = todayLocalIso();
  return { start: addDays(today, -59), end: addDays(today, 1) };
}

function last12MonthsRange(): { start: string; end: string } {
  const today = todayLocalIso();
  return { start: addMonths(firstOfMonth(today), -11), end: addDays(today, 1) };
}

function yearRange(year: string): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` };
}

const CURRENT_YEAR = new Date().getFullYear();

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium uppercase tracking-wide text-mist">{children}</h2>;
}

// Ein generischer Baustein pro Abschnitt: laedt/Fehler/Inhalt sind bewusst
// PRO Abschnitt entkoppelt (eigener error-State je Datenquelle unten,
// nicht ein einziger geteilter `error`) - vorher blendete ein einzelner
// fehlgeschlagener Request (z.B. Wellness) das gesamte restliche Dashboard
// aus, obwohl Analyse-/Zonen-Daten laengst geladen waren.
function SectionStatus({
  error,
  loading,
  children,
}: {
  error: string | null;
  loading: boolean;
  children: React.ReactNode;
}) {
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading) return <p className="text-sm text-mist">Lädt...</p>;
  return <>{children}</>;
}

function DashboardContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  // EINE Zonen-Antwort fuer alle drei Abschnitte, die sie brauchen (Umfang,
  // Zonenverteilung, Trainingserfuellung): vorher lief derselbe Request mit
  // identischen Parametern zweimal parallel - doppelte Rechenzeit im Backend
  // fuer exakt dasselbe Ergebnis.
  const [zones, setZones] = useState<TrainingZonesResponse | null>(null);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [wellness, setWellness] = useState<WellnessSeriesResponse | null>(null);
  const [wellnessError, setWellnessError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [athletesError, setAthletesError] = useState<string | null>(null);

  const selectedAthleteId = searchParams.get("athlete_id")
    ? Number(searchParams.get("athlete_id"))
    : user?.id;
  const periodMode: PeriodMode = (searchParams.get("period") as PeriodMode | null) ?? "last60";
  const year = searchParams.get("year") ?? String(CURRENT_YEAR);

  // Jahre, fuer die ueberhaupt Aktivitaetsdaten vorliegen (Datenverfuegbarkeit) -
  // absteigend sortiert, damit das aktuellste Jahr zuerst im Dropdown steht.
  const availableYears = Array.from(
    new Set((activities ?? []).map((a) => a.day.slice(0, 4)))
  ).sort((a, b) => Number(b) - Number(a));
  const yearOptions = availableYears.length > 0 ? availableYears : [String(CURRENT_YEAR)];

  const range: { start: string; end: string } =
    periodMode === "year" ? yearRange(year) : periodMode === "last12m" ? last12MonthsRange() : last60DaysRange();
  // Stabiler Cache-Key fuers useEffect-Dependency-Array, damit ein Wechsel
  // zwischen den beiden Modi (und innerhalb eines Modus) immer genau einmal
  // neu laedt, unabhaengig davon, ob `range` ein neues Objektliteral ist.
  const rangeKey = `${range.start}_${range.end}`;

  useEffect(() => {
    if (!user || !token || user.role !== "trainer") return;
    getAthletes(token)
      .then(setAthletes)
      .catch(() => setAthletesError("Athletenliste konnte nicht geladen werden"));
  }, [user, token]);

  // Ohne Athletenlisten-Einstiegspunkt (siehe Navbar.tsx) muss die Seite
  // selbst einen Athleten vorauswaehlen, sonst faellt selectedAthleteId
  // auf die eigene Trainer-ID zurueck und die Seite zeigt leere Daten.
  useEffect(() => {
    if (!user || user.role !== "trainer" || searchParams.get("athlete_id") || athletes.length === 0) return;
    updateParam("athlete_id", String(athletes[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, athletes, searchParams]);

  const loadActivities = useCallback(() => {
    if (!token || !selectedAthleteId) return;
    getActivities(selectedAthleteId, token)
      .then((data) => {
        setActivities(data);
        setActivitiesError(null);
      })
      .catch(() => setActivitiesError("Aktivitäten konnten nicht geladen werden"));
  }, [token, selectedAthleteId]);

  useEffect(() => {
    if (!token || !selectedAthleteId) return;

    setAnalyticsError(null);
    getAnalytics(selectedAthleteId, token, range)
      .then(setAnalytics)
      .catch(() => setAnalyticsError("Analyse-Daten konnten nicht geladen werden"));

    setZonesError(null);
    getTrainingZones(selectedAthleteId, range, token)
      .then(setZones)
      .catch(() => setZonesError("Zonen-Daten konnten nicht geladen werden"));

    setWellnessError(null);
    getWellnessSeries(selectedAthleteId, range, token)
      .then(setWellness)
      .catch(() => setWellnessError("Physiologische Daten konnten nicht geladen werden"));

    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedAthleteId, rangeKey, loadActivities]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/dashboard?${params.toString()}`);
  }

  // Das Zeitraum-Dropdown vereint zwei rollierende Fenster ("last60"/
  // "last12m") und die verfuegbaren Kalenderjahre in einer einzigen Liste -
  // eine Jahresauswahl setzt daher period=year zusammen mit dem gewaehlten
  // Jahr in einem Schritt.
  function updatePeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "last60" || value === "last12m") {
      params.set("period", value);
    } else {
      params.set("period", "year");
      params.set("year", value);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  const selectClass = "select-inline";

  return (
    <main className="page max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          {user?.role === "trainer" && (
            <select
              className={selectClass}
              value={selectedAthleteId ?? ""}
              onChange={(e) => updateParam("athlete_id", e.target.value)}
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <select
            className={selectClass}
            value={periodMode === "year" ? year : periodMode}
            onChange={(e) => updatePeriod(e.target.value)}
          >
            <option value="last60">Letzte 60 Tage</option>
            <option value="last12m">Letzte 12 Monate</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {athletesError && <p className="text-sm text-danger">{athletesError}</p>}

      <section className="space-y-3">
        <SectionHeading>Aktivitäten der letzten Woche</SectionHeading>
        <SectionStatus error={activitiesError} loading={activities === null && !activitiesError}>
          <ActivityList
            // Immer die rollierenden letzten 7 Tage, unabhaengig vom
            // Zeitraum-Dropdown oben (das steuert nur Analyse-/Zonen-Charts) -
            // fuer den vollen Verlauf gibt es die Trainingsplan-/Protokoll-
            // Seite (app/training-plan/page.tsx).
            activities={(activities ?? []).filter((a) => a.day >= addDays(todayLocalIso(), -6))}
            onChanged={loadActivities}
            subjectName={
              user?.role === "trainer" ? athletes.find((a) => a.id === selectedAthleteId)?.name : user?.name
            }
          />
        </SectionStatus>
      </section>

      <section className="space-y-3">
        <SectionHeading>Physiologische Daten</SectionHeading>
        <SectionStatus error={wellnessError} loading={!wellness && !wellnessError}>
          {wellness && <WellnessCharts data={wellness} />}
        </SectionStatus>
      </section>

      <section className="space-y-3">
        <SectionHeading>Belastung &amp; Verletzungsrisiko</SectionHeading>
        <SectionStatus error={analyticsError} loading={!analytics && !analyticsError}>
          {analytics && <WorkloadRiskChart data={analytics.workload} />}
        </SectionStatus>
      </section>

      <section className="space-y-3">
        <SectionHeading>Leistung</SectionHeading>
        <SectionStatus error={analyticsError} loading={!analytics && !analyticsError}>
          {analytics && (
            <Vo2maxChart data={analytics.vo2max_series} range={range} predictions={analytics.predictions} />
          )}
        </SectionStatus>
      </section>

      <section className="space-y-3">
        <SectionHeading>Umfang</SectionHeading>
        <SectionStatus
          error={analyticsError ?? zonesError}
          loading={(!analytics || !zones) && !analyticsError && !zonesError}
        >
          {analytics && (
            <div className="space-y-4">
              <WeeklyVolumeChart
                totalData={analytics.weekly_volume}
                zoneData={analytics.weekly_volume_by_zone}
                zoneSummary={zones?.weekly_zone_summary ?? []}
                range={range}
              />
              {zones && (
                <ZoneDistribution
                  runZoneKm={analytics.weekly_volume_by_zone}
                  runZoneMinutes={zones.weekly_pace_zone_minutes}
                  zoneSummary={zones.weekly_zone_summary}
                  range={range}
                />
              )}
            </div>
          )}
        </SectionStatus>
      </section>

      <section className="space-y-3">
        <SectionHeading>Trainingserfüllung</SectionHeading>
        <SectionStatus error={zonesError} loading={!zones && !zonesError}>
          {zones && <WeeklyZoneComparisonChart data={zones.weekly_zone_summary} range={range} />}
        </SectionStatus>
      </section>

      {selectedAthleteId && (
        <section className="space-y-3">
          <SectionHeading>Trainingsjahre</SectionHeading>
          <PeriodStatsTable athleteId={selectedAthleteId} />
        </section>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RouteGuard>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <DashboardContent />
      </Suspense>
    </RouteGuard>
  );
}
