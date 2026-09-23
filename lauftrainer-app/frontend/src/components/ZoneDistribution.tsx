"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { activeDotStyle, getChartColors, lineCursorStyle, roundTick, tooltipStyle } from "@/lib/chart-theme";
import { formatHoursMinutes } from "@/lib/format";
import { CYCLING_ZONES, isoWeekLabel, padWeeks, pivotZoneSummaryBySport, SWIMMING_ZONES, weeksInRange } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { WeeklyVolumeByZonePoint, WeeklyZoneSummary } from "@/types/training";

// Gleiche Zonenfarben wie WeeklyVolumeChart ("Trainingsverlauf"), fuer eine
// konsistente Farbcodierung ueber alle Zonen-Ansichten im Dashboard hinweg.
const ZONE_COLORS: Record<"GA1" | "Schwelle" | "VO2max", string> = {
  GA1: "#5b9bd5",
  Schwelle: "#e0b23e",
  VO2max: "#e0604a",
};

type Tab = "total" | "run" | "bike" | "swim";

const TABS: { label: string; tab: Tab }[] = [
  { label: "Gesamt", tab: "total" },
  { label: "Laufen", tab: "run" },
  { label: "Radfahren", tab: "bike" },
  { label: "Schwimmen", tab: "swim" },
];

type ZoneRow = { week_start: string; GA1: number; Schwelle: number; VO2max: number };

function zeroZoneRow(week_start: string): ZoneRow {
  return { week_start, GA1: 0, Schwelle: 0, VO2max: 0 };
}

// "Gesamt" summiert die drei Zonen sportartuebergreifend in Minuten (Laufen
// hier ueber weekly_pace_zone_minutes statt der km-Ableitung, damit sich
// Rad-/Schwimmzeiten - die es nur in Minuten gibt - ueberhaupt sinnvoll
// dazuaddieren lassen, siehe backend/app/services/training_zones.py:
// compute_weekly_pace_zone_minutes).
function sumZoneRows(rows: ZoneRow[][]): ZoneRow[] {
  const byWeek = new Map<string, ZoneRow>();
  for (const group of rows) {
    for (const row of group) {
      const entry = byWeek.get(row.week_start) ?? zeroZoneRow(row.week_start);
      byWeek.set(row.week_start, {
        week_start: row.week_start,
        GA1: entry.GA1 + row.GA1,
        Schwelle: entry.Schwelle + row.Schwelle,
        VO2max: entry.VO2max + row.VO2max,
      });
    }
  }
  return Array.from(byWeek.values());
}

function pivotRunKm(data: WeeklyVolumeByZonePoint[]): ZoneRow[] {
  return data.map((d) => ({ week_start: d.week_start, GA1: d.GA1, Schwelle: d.Schwelle, VO2max: d.VO2max }));
}

export function ZoneDistribution({
  runZoneKm,
  runZoneMinutes,
  zoneSummary,
  range,
}: {
  runZoneKm: WeeklyVolumeByZonePoint[];
  runZoneMinutes: WeeklyZoneSummary[];
  zoneSummary: WeeklyZoneSummary[];
  range: { start: string; end: string };
}) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const chartHeight = useChartHeight(260);
  const [tab, setTab] = useState<Tab>("total");
  const weeks = weeksInRange(range.start, range.end);

  const bikeRows = pivotZoneSummaryBySport(zoneSummary, CYCLING_ZONES);
  const swimRows = pivotZoneSummaryBySport(zoneSummary, SWIMMING_ZONES);
  const runKmRows = pivotRunKm(runZoneKm);
  const runMinuteRows = pivotZoneSummaryBySport(runZoneMinutes, ["GA1", "Schwelle", "VO2max"]);

  const unit = tab === "run" ? "km" : "min";
  const rows =
    tab === "run"
      ? runKmRows
      : tab === "bike"
        ? bikeRows
        : tab === "swim"
          ? swimRows
          : sumZoneRows([runMinuteRows, bikeRows, swimRows]);
  const chartData = padWeeks(rows, weeks, zeroZoneRow);
  const hasData = chartData.some((d) => d.GA1 > 0 || d.Schwelle > 0 || d.VO2max > 0);

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-ink">Kilometer pro Zone</h2>
        <div className="flex flex-wrap gap-1 text-xs">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              className={t.tab === tab ? "chip-active" : "chip"}
              onClick={() => setTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {!hasData ? (
        <p className="text-sm text-mist">Noch keine nach Zone klassifizierten Trainingskilometer vorhanden.</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="week_start"
              tickFormatter={isoWeekLabel}
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
            />
            <YAxis
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
              unit={unit === "km" ? " km" : undefined}
              tickFormatter={unit === "km" ? roundTick : formatHoursMinutes}
            />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              labelFormatter={isoWeekLabel}
              formatter={(value: number, name: string) => [
                unit === "km" ? `${value.toFixed(1)} km` : formatHoursMinutes(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ color: colors.tick, fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="GA1"
              stroke={ZONE_COLORS.GA1}
              strokeWidth={2}
              dot={{ r: 3, fill: ZONE_COLORS.GA1, strokeWidth: 0 }}
              activeDot={activeDotStyle(colors, ZONE_COLORS.GA1)}
              name="GA1"
            />
            <Line
              type="monotone"
              dataKey="Schwelle"
              stroke={ZONE_COLORS.Schwelle}
              strokeWidth={2}
              dot={{ r: 3, fill: ZONE_COLORS.Schwelle, strokeWidth: 0 }}
              activeDot={activeDotStyle(colors, ZONE_COLORS.Schwelle)}
              name="Schwelle"
            />
            <Line
              type="monotone"
              dataKey="VO2max"
              stroke={ZONE_COLORS.VO2max}
              strokeWidth={2}
              dot={{ r: 3, fill: ZONE_COLORS.VO2max, strokeWidth: 0 }}
              activeDot={activeDotStyle(colors, ZONE_COLORS.VO2max)}
              name="VO2max"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
