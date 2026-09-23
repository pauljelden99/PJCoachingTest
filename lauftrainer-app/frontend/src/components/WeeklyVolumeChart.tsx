"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { barCursorStyle, getChartColors, roundTick, tooltipStyle } from "@/lib/chart-theme";
import { formatHoursMinutes } from "@/lib/format";
import { CYCLING_ZONES, isoWeekLabel, padWeeks, pivotZoneSummaryBySport, SWIMMING_ZONES, weeksInRange } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type {
  WeeklyVolumeByZonePoint,
  WeeklyVolumeBySportPoint,
  WeeklyVolumePoint,
  WeeklyZoneSummary,
} from "@/types/training";

// Gleiche Zonenfarben wie ZoneTimeChart/ZoneDistribution (GA1, Schwelle,
// VO2max), fuer eine konsistente Farbcodierung ueber alle Zonen-Ansichten
// im Dashboard hinweg.
const ZONE_COLORS: Record<"GA1" | "Schwelle" | "VO2max", string> = {
  GA1: "#5b9bd5",
  Schwelle: "#e0b23e",
  VO2max: "#e0604a",
};

type Tab = "total" | WeeklyVolumeBySportPoint["sport"];

// "Gesamt" (ueber alle Sportarten hinweg) ist eine eigene Tab-Ebene,
// gleichrangig zu Laufen/Radfahren/Schwimmen - keine Sub-Ansicht mehr
// innerhalb einer Sportart. Sie bleibt bewusst eine einfache Summenkurve
// (mit km/Minuten-Umschalter) statt einer Zonen-Aufteilung, da eine
// sportartuebergreifende Zonensumme km (Laufen) und Minuten (Rad/Schwimmen)
// vermischen wuerde. Die drei Sport-Tabs zeigen dagegen IMMER die
// Zonen-Aufteilung (GA1/Schwelle/VO2max) - Laufen in km (aus
// weekly_volume_by_zone), Radfahren/Schwimmen in Minuten (aus
// weekly_zone_summary, deren "actual"-Werte je Zone/Woche).
const TABS: { label: string; tab: Tab }[] = [
  { label: "Gesamt", tab: "total" },
  { label: "Laufen", tab: "run" },
  { label: "Radfahren", tab: "bike" },
  { label: "Schwimmen", tab: "swim" },
];

function pivotTotal(data: WeeklyVolumePoint[]) {
  return [...data].sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export function WeeklyVolumeChart({
  totalData,
  zoneData,
  zoneSummary,
  range,
}: {
  totalData: WeeklyVolumePoint[];
  zoneData: WeeklyVolumeByZonePoint[];
  zoneSummary: WeeklyZoneSummary[];
  range: { start: string; end: string };
}) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const chartHeight = useChartHeight(240);
  const [tab, setTab] = useState<Tab>("total");
  // Minuten-Umschalter gilt nur fuer die Gesamt-Ansicht - die Sport-Tabs
  // sind jeweils fest auf eine Einheit festgelegt (Laufen km, Rad/Schwimmen
  // Minuten), siehe Kommentar bei TABS oben.
  const [unit, setUnit] = useState<"km" | "min">("km");
  const showZonesActive = tab !== "total";
  const weeks = weeksInRange(range.start, range.end);
  const totalChartData = padWeeks(pivotTotal(totalData), weeks, (week_start) => ({ week_start, km: 0, minutes: 0 }));
  const unitLabel = unit === "km" ? "km" : "min";
  const dataKey = unit === "km" ? "km" : "minutes";
  const zoneUnitLabel = tab === "run" ? "km" : "min";
  const zeroZoneRow = (week_start: string) => ({ week_start, GA1: 0, Schwelle: 0, VO2max: 0 });
  const zoneChartData = padWeeks(
    tab === "run"
      ? zoneData
      : tab === "bike"
        ? pivotZoneSummaryBySport(zoneSummary, CYCLING_ZONES)
        : tab === "swim"
          ? pivotZoneSummaryBySport(zoneSummary, SWIMMING_ZONES)
          : [],
    weeks,
    zeroZoneRow
  );

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-ink">Trainingsverlauf</h2>
        <div className="flex flex-wrap gap-1 text-xs">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              className={tab === t.tab ? "chip-active" : "chip"}
              onClick={() => setTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "total" && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <div className="flex gap-1 text-xs">
            <button type="button" className={unit === "km" ? "chip-active" : "chip"} onClick={() => setUnit("km")}>
              km
            </button>
            <button type="button" className={unit === "min" ? "chip-active" : "chip"} onClick={() => setUnit("min")}>
              Minuten
            </button>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={chartHeight}>
        {!showZonesActive ? (
          <BarChart data={totalChartData}>
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
              unit={unit === "km" ? ` ${unitLabel}` : undefined}
              tickFormatter={unit === "km" ? roundTick : formatHoursMinutes}
            />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={barCursorStyle(colors)}
              labelFormatter={isoWeekLabel}
              formatter={(value: number) => [
                unit === "km" ? `${value.toFixed(1)} km` : formatHoursMinutes(value),
                unit === "km" ? "Distanz" : "Dauer",
              ]}
            />
            <Bar dataKey={dataKey} fill={colors.blue} radius={[4, 4, 0, 0]} name={unitLabel} />
          </BarChart>
        ) : (
          <BarChart data={zoneChartData}>
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
              unit={zoneUnitLabel === "km" ? ` ${zoneUnitLabel}` : undefined}
              tickFormatter={zoneUnitLabel === "km" ? roundTick : formatHoursMinutes}
            />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={barCursorStyle(colors)}
              labelFormatter={isoWeekLabel}
              formatter={(value: number, name: string) => [
                zoneUnitLabel === "km" ? `${value.toFixed(1)} km` : formatHoursMinutes(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ color: colors.tick, fontSize: 12 }} />
            <Bar dataKey="GA1" stackId="zones" fill={ZONE_COLORS.GA1} name="GA1" />
            <Bar dataKey="Schwelle" stackId="zones" fill={ZONE_COLORS.Schwelle} name="Schwelle" />
            <Bar dataKey="VO2max" stackId="zones" fill={ZONE_COLORS.VO2max} radius={[4, 4, 0, 0]} name="VO2max" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
