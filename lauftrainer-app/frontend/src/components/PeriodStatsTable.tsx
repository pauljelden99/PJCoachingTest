"use client";

import { useEffect, useState } from "react";

import { ApiError, getPeriodStats } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { MONTH_LABELS } from "@/lib/plan";
import type { MonthStats, YearStats } from "@/types/training";

function formatPct(value: number | null): string {
  return value != null ? `${value.toFixed(0)}%` : "–";
}

function formatVo2max(value: number | null): string {
  return value != null ? value.toFixed(1) : "–";
}

// "hh:mm" ohne Sekunden - im Unterschied zu lib/format.ts:formatDuration
// (dort "m:ss"/"h:mm:ss") speziell fuer die hier dargestellten Dauern
// gedacht; Stunden bewusst ungepolstert.
function formatHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

// Eine Datenzeile (Jahr oder Monat) auf die gemeinsamen Zellen abgebildet -
// gemeinsam von der Jahres- und den Monats-Zeilen genutzt, damit beide
// exakt dieselbe Formatierung verwenden.
function StatCells({ row }: { row: MonthStats | YearStats }) {
  return (
    <>
      <td className="py-2 text-ink">{row.avg_km_per_week.toFixed(1)} km</td>
      <td className="py-2 text-ink">{formatPct(row.pct_ga1)}</td>
      <td className="py-2 text-ink">{formatPct(row.pct_schwelle)}</td>
      <td className="py-2 text-ink">{formatPct(row.pct_vo2max)}</td>
      <td className="py-2 text-ink">{formatVo2max(row.mean_effective_vo2max)}</td>
      <td className="py-2 text-ink">{formatHoursMinutes(row.sonstige_avg_h_per_week * 3600)} h</td>
    </>
  );
}

// Zeile pro Jahr, mit Auf-/Zuklapp-Button, der alle 12 Monatszeilen dieses
// Jahres gleichzeitig ein-/ausblendet - alle Werte (Jahr + jeder Monat)
// sind bereits im initial geladenen Payload enthalten (siehe
// backend/app/api/analytics.py:get_period_stats), das Auf-/Zuklappen
// selbst ist daher rein clientseitig ohne Nachladen.
function YearRow({ year, expanded, onToggle }: { year: YearStats; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-mist/10 transition-colors hover:bg-mist/5">
        <td className="py-2 text-ink">{year.year}</td>
        <td className="py-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-moss transition-colors hover:underline"
          >
            {expanded ? "▴ Monate ausblenden" : "▾ Monate anzeigen"}
          </button>
        </td>
        <StatCells row={year} />
      </tr>
      {expanded &&
        [...year.months].reverse().map((m) => (
          <tr key={m.month} className="border-t border-mist/5 text-mist">
            <td className="py-1.5 pl-4 text-xs">{year.year}</td>
            <td className="py-1.5 pl-4 text-xs">{MONTH_LABELS[m.month - 1]}</td>
            <StatCells row={m} />
          </tr>
        ))}
    </>
  );
}

// Neue Statistik-Tabelle "Trainingsjahre": Durchschnittskilometer/Woche,
// prozentualer Anteil GA1/Schwelle/VO2max sowie mittlerer effektiver
// VO2max, pro Jahr und (aufklappbar) pro Monat - unabhaengig vom
// Dashboard-Zeitraumfilter, zeigt immer die komplette Historie.
export function PeriodStatsTable({ athleteId }: { athleteId: number }) {
  const { token } = useAuth();
  const [years, setYears] = useState<YearStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setYears(null);
    setError(null);
    getPeriodStats(athleteId, token)
      .then((res) => {
        if (!cancelled) setYears(res.years);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Statistik konnte nicht geladen werden");
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId, token]);

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  return (
    <div className="card">
      <h2 className="text-base font-medium text-ink">Trainingsjahre</h2>
      <p className="mt-1 text-xs text-mist">
        Durchschnittliche Wochenkilometer (nur Laufen), prozentualer Anteil GA1/Schwelle/VO2max (nur Laufzonen),
        mittlerer effektiver VO2max sowie der wöchentliche Schnitt aller Rad-/Schwimm-/Sonstige-Einheiten (hh:mm) -
        pro Jahr, aufklappbar auch für jeden einzelnen Monat.
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!error && years === null && <p className="mt-3 text-sm text-mist">Lädt...</p>}
      {!error && years !== null && years.length === 0 && (
        <p className="mt-3 text-sm text-mist">Noch keine Trainingshistorie vorhanden.</p>
      )}
      {!error && years !== null && years.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist">
                <th className="py-2 font-normal">Jahr</th>
                <th className="py-2 font-normal">Monat</th>
                <th className="py-2 font-normal">Ø Lauf</th>
                <th className="py-2 font-normal">GA1</th>
                <th className="py-2 font-normal">Schwelle</th>
                <th className="py-2 font-normal">VO2max</th>
                <th className="py-2 font-normal">Ø eff. VO2max</th>
                <th className="py-2 font-normal">Ø Sonstige</th>
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((year) => (
                <YearRow
                  key={year.year}
                  year={year}
                  expanded={expandedYears.has(year.year)}
                  onToggle={() => toggleYear(year.year)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
