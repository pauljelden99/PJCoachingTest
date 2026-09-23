"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { activeDotStyle, getChartColors, lineCursorStyle, roundTick, tooltipStyle, type ChartColors } from "@/lib/chart-theme";
import { formatDuration } from "@/lib/format";
import { isoWeekLabel, mondayOf, weeksInRange } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { RacePredictions as RacePredictionsType, Vo2maxPoint } from "@/types/training";

const RACE_LABELS: Record<string, string> = {
  "5k": "5 km",
  "10k": "10 km",
  half_marathon: "Halbmarathon",
  marathon: "Marathon",
};

const RACE_ORDER = ["5k", "10k", "half_marathon", "marathon"];

interface WeeklyVo2max {
  week_start: string;
  mean: number | null;
  stdDev: number;
  count: number;
  // [mean - stdDev, mean + stdDev] als recharts-Bereichsbalken (Bar mit
  // einem [min, max]-Tupel als Wert, siehe "Range Bar" unten) - die
  // grafische Grundlage fuer den Fehlerbalken. null in Luecken-Wochen
  // (mean: null), damit dort kein Balken gezeichnet wird.
  range: [number, number] | null;
}

// Ein Datenpunkt pro Kalenderwoche (Mittelwert aller in dieser Woche
// gemessenen Einheiten) statt einem Punkt pro Einheit - bei mehreren
// Einheiten pro Woche wirkte die vorherige Punktwolke sehr unruhig und
// liess sich schlecht als Trend lesen. Die Streuung innerhalb der Woche
// bleibt ueber die Standardabweichung als Fehlerbalken sichtbar, statt
// verloren zu gehen. Wochen ganz ohne auswertbare Einheit bekommen einen
// Luecken-Punkt (mean: null), damit der gesamte gewaehlte Zeitraum
// angezeigt wird (siehe lib/plan.ts:weeksInRange), nicht nur Wochen mit
// Daten.
function toWeeklyMeans(data: Vo2maxPoint[], range: { start: string; end: string }): WeeklyVo2max[] {
  const byWeek = new Map<string, number[]>();
  for (const point of data) {
    const week = mondayOf(point.day);
    const values = byWeek.get(week) ?? [];
    values.push(point.vo2max);
    byWeek.set(week, values);
  }
  return weeksInRange(range.start, range.end).map((week_start) => {
    const values = byWeek.get(week_start) ?? [];
    if (values.length === 0) return { week_start, mean: null, stdDev: 0, count: 0, range: null };
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    return { week_start, mean, stdDev, count: values.length, range: [mean - stdDev, mean + stdDev] };
  });
}

// Eigener Tooltip-Inhalt statt formatter-Prop: der Bereichsbalken (dataKey
// "range", siehe WeeklyVo2max) taucht als eigener Tooltip-Eintrag auf, wenn
// man recharts nur ueber `formatter` anpasst - hier wird gezielt nur der
// Line-Eintrag ("mean") gerendert, die Bereichsdarstellung bleibt rein
// grafisch (kein eigener Tooltip-Eintrag).
function vo2maxTooltipContent(colors: ChartColors) {
  return function Content({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { dataKey?: string | number; value?: number; payload?: WeeklyVo2max }[];
    label?: string;
  }) {
    if (!active || !payload) return null;
    const entry = payload.find((p) => p.dataKey === "mean");
    if (!entry || entry.value == null || !entry.payload) return null;
    const point = entry.payload;
    const style = tooltipStyle(colors);
    return (
      <div style={{ ...style.contentStyle, padding: "8px 10px" }}>
        <p style={style.labelStyle} className="mb-1 text-xs">
          {isoWeekLabel(label ?? "")}
        </p>
        <p style={style.itemStyle} className="text-xs">
          {`${entry.value.toFixed(1)} ± ${point.stdDev.toFixed(1)} ml/kg/min (${point.count} Einheit${point.count === 1 ? "" : "en"})`}
        </p>
      </div>
    );
  };
}

// Vereint den Eff.-VO2max-Verlauf mit der daraus abgeleiteten
// Wettkampfprognose in einer Box (vorher zwei getrennte Karten
// "Eff. VO2max"/"Wettkampfprognose" nebeneinander) - die Prognose basiert
// direkt auf demselben VDOT-Wert wie der Graph darueber (Umkehrung
// derselben Daniels-Gilbert-Formel, siehe backend/app/services/
// analytics.py:predict_race_times_from_vdot), daher gehoeren beide
// inhaltlich zusammen statt nebeneinander in getrennten Karten zu stehen.
export function Vo2maxChart({
  data,
  range,
  predictions,
}: {
  data: Vo2maxPoint[];
  range: { start: string; end: string };
  predictions: Partial<RacePredictionsType>;
}) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const chartHeight = useChartHeight(240);
  const weekly = toWeeklyMeans(data, range);
  const hasData = weekly.some((w) => w.mean !== null);
  const hasPredictions = Object.keys(predictions).length > 0;

  return (
    <div className="card">
      <h2 className="mb-1 text-base font-medium text-ink">Eff. VO2max</h2>
      <p className="mb-4 text-xs text-mist">
        Wochenmittelwert (Fehlerbalken = Standardabweichung) aus der Daniels-Gilbert-VDOT-Formel, geschätzt aus
        Distanz und Dauer jeder Einheit (Daniels, J. &amp; Gilbert, J., 1979: &bdquo;Oxygen Power&ldquo;; Daniels,
        J., &bdquo;Daniels&apos; Running Formula&ldquo;, Human Kinetics).
      </p>
      {!hasData ? (
        <p className="text-sm text-mist">Noch keine auswertbaren Einheiten (mind. 3 Minuten).</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={weekly}>
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
              domain={["dataMin - 2", "dataMax + 2"]}
              unit=" ml/kg/min"
              tickFormatter={roundTick}
            />
            <Tooltip cursor={lineCursorStyle(colors)} content={vo2maxTooltipContent(colors)} />
            {/* Fehlerbalken (mean ± stdDev) als graues, abgerundetes
                Rechteck im Hintergrund statt eines duennen Linien-
                Fehlerbalkens - vor der Line gerendert, damit sie optisch
                darunter liegt (spaeter gerenderte SVG-Elemente liegen bei
                recharts oben). */}
            <Bar dataKey="range" fill={colors.mist} fillOpacity={0.25} radius={[6, 6, 6, 6]} barSize={16} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="mean"
              stroke={colors.moss}
              strokeWidth={2}
              dot={{ r: 3, fill: colors.moss, strokeWidth: 0 }}
              activeDot={activeDotStyle(colors, colors.moss)}
              name="VO2max"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 border-t border-mist/15 pt-4">
        <h3 className="mb-1 text-sm font-medium text-ink">Wettkampfprognose</h3>
        <p className="mb-3 text-xs text-mist">
          Hochgerechnet aus dem eff. VO2max (Jack-Daniels-VDOT) der besten Einheit der letzten 90 Tage - Umkehrung
          derselben Daniels-Gilbert-Formel wie oben (Daniels, J. &amp; Gilbert, J., 1979: &bdquo;Oxygen
          Power&ldquo;).
        </p>
        {!hasPredictions ? (
          <p className="text-sm text-mist">Noch keine ausreichende Datenbasis für eine Prognose.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RACE_ORDER.filter((key) => predictions[key as keyof RacePredictionsType] !== undefined).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-mist/15 bg-paper p-3 text-center transition-transform hover:-translate-y-0.5"
              >
                <div className="text-xs text-mist">{RACE_LABELS[key]}</div>
                <div className="mt-1 text-lg font-medium text-moss">
                  {formatDuration(predictions[key as keyof RacePredictionsType] as number)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
