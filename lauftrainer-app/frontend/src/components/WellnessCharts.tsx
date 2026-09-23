"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { activeDotStyle, getChartColors, lineCursorStyle, tooltipStyle } from "@/lib/chart-theme";
import { formatDateDMY } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { WellnessBaselinePoint, WellnessSeriesResponse } from "@/types/training";

function SingleWellnessChart({
  title,
  unit,
  data,
  color,
  gridColor,
  tickColor,
  colors,
  valueFormatter,
}: {
  title: string;
  unit: string;
  data: WellnessBaselinePoint[];
  color: string;
  gridColor: string;
  tickColor: string;
  colors: ReturnType<typeof getChartColors>;
  valueFormatter: (v: number) => string;
}) {
  const chartHeight = useChartHeight(200);
  const chartData = data.map((p) => ({
    ...p,
    bandBase: p.baseline_lower,
    bandWidth:
      p.baseline_lower != null && p.baseline_upper != null ? p.baseline_upper - p.baseline_lower : null,
  }));
  const hasAnyValue = data.some((p) => p.value != null);

  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-medium text-ink">{title}</h3>
      {!hasAnyValue ? (
        <p className="text-sm text-mist">Noch keine Werte erfasst.</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="day"
              tickFormatter={formatDateDMY}
              tick={{ fontSize: 11, fill: tickColor }}
              stroke={gridColor}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: tickColor }}
              stroke={gridColor}
              unit={unit}
              domain={["auto", "auto"]}
            />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              labelFormatter={formatDateDMY}
              formatter={(value: number, name: string) => [valueFormatter(value), name]}
            />
            <Area dataKey="bandBase" stackId="ci" stroke="none" fill="transparent" name="Band (unten)" />
            <Area
              dataKey="bandWidth"
              stackId="ci"
              stroke="none"
              fill={color}
              fillOpacity={0.12}
              name="90%-Band (30-Tage-Basis)"
            />
            <Line
              dataKey="baseline_mean"
              stroke={color}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              name="Basiswert (30-Tage-Mittel)"
            />
            <Line
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, fill: color }}
              activeDot={activeDotStyle(colors, color)}
              connectNulls={false}
              name={title}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Vier separate Charts, ab Tablet-Breite im 2x2-Raster (statt an breiten
// Bildschirmen vier nebeneinander; auf dem Smartphone untereinander, da
// zwei Charts nebeneinander dort je unter 160px breit waeren) - da die
// Metriken unterschiedliche Einheiten/
// Wertebereiche haben (bpm, ms, h, 1-10) und sich sonst gegenseitig auf der
// Y-Achse verzerren wuerden. Jede Chart zeigt zusaetzlich zum Tageswert eine
// Baseline (30-Tage-Mittel) mit 90%-Streuungsband (siehe
// backend/app/services/wellness.py:compute_baseline_series).
export function WellnessCharts({ data }: { data: WellnessSeriesResponse }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <SingleWellnessChart
        title="Ruhepuls"
        unit=" bpm"
        data={data.resting_hr}
        color={colors.moss}
        gridColor={colors.grid}
        tickColor={colors.tick}
        colors={colors}
        valueFormatter={(v) => `${v.toFixed(0)} bpm`}
      />
      <SingleWellnessChart
        title="HRV"
        unit=" ms"
        data={data.hrv}
        color={colors.blue}
        gridColor={colors.grid}
        tickColor={colors.tick}
        colors={colors}
        valueFormatter={(v) => `${v.toFixed(0)} ms`}
      />
      <SingleWellnessChart
        title="Schlafdauer"
        unit=" h"
        data={data.sleep_duration_h}
        color={colors.amber}
        gridColor={colors.grid}
        tickColor={colors.tick}
        colors={colors}
        valueFormatter={(v) => `${v.toFixed(1)} h`}
      />
      <SingleWellnessChart
        title="Schlafqualität"
        unit=""
        data={data.sleep_quality}
        color={colors.violet}
        gridColor={colors.grid}
        tickColor={colors.tick}
        colors={colors}
        valueFormatter={(v) => `${v.toFixed(1)}/10`}
      />
    </div>
  );
}
