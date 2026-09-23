"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { barCursorStyle, getChartColors, tooltipStyle } from "@/lib/chart-theme";
import { isoWeekLabel, mondayOf, TARGET_ZONE_GROUPS, todayLocalIso, weeksInRange } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { WeeklyZoneSummary } from "@/types/training";

// Dieselbe Zonenfarbzuordnung wie ZoneSummaryChart, fuer eine konsistente
// Farbcodierung ueber alle Plan-vs-Ist-Ansichten im Dashboard.
const ZONE_LABEL: Record<string, string> = {
  GA1: "GA1",
  Schwelle: "Schwelle",
  VO2max: "VO2max",
  "Sprint/Reps": "Sprint/Reps",
  Athletik: "Athletik",
  Beweglichkeit: "Beweglichkeit",
  Krafttraining: "Krafttraining",
  "Radfahren (GA1)": "Radfahren (GA1)",
  "Radfahren (Schwelle)": "Radfahren (Schwelle)",
  "Radfahren (VO2max)": "Radfahren (VO2max)",
  "Schwimmen (GA1)": "Schwimmen (GA1)",
  "Schwimmen (Schwelle)": "Schwimmen (Schwelle)",
  "Schwimmen (VO2max)": "Schwimmen (VO2max)",
};
const ZONE_ORDER = Object.keys(ZONE_LABEL);

// Die vier lauf-spezifischen, distanzbasierten Zonen - Grundlage der
// "Gesamt (km)"-Option unten. Athletik/Beweglichkeit sind Minuten-Zonen und
// fliessen bewusst nicht in eine Kilometersumme ein (identische Abgrenzung
// wie die Gesamtkilometer-Anzeige in ZoneSummaryChart.tsx).
const KM_ZONES = ["GA1", "Schwelle", "VO2max", "Sprint/Reps"];
const TOTAL_KM_OPTION = "__total_km__";

function unitLabel(unit: string, value: number): string {
  return unit === "minutes" ? `${Math.round(value)} min` : `${value.toFixed(1)} km`;
}

// Erfuellungsgrad in % (analog zu ZoneSummaryChart.tsx) statt absoluter
// Werte. War in der Woche nichts geplant, aber trotzdem trainiert wurde,
// gilt das als volle Erfuellung (100%) statt als 0%/undefiniert - es gibt
// schlicht keinen Plan, an dem man "unter"erfuellt haben koennte. Nur wenn
// wirklich weder geplant noch trainiert wurde, liefert diese Funktion null
// (kein Balken, siehe hasPlan unten) - kommt in der Praxis nicht vor, da
// solche Wochen serverseitig bereits herausgefiltert werden (siehe
// compute_weekly_zone_summary), ist hier aber als Fallback abgesichert.
function pctOf(planned: number, actual: number): number | null {
  if (planned > 0) return (actual / planned) * 100;
  if (actual > 0) return 100;
  return null;
}

// Montag der laufenden Kalenderwoche - fuer die visuelle Markierung dieser
// Woche als "in Arbeit" unten (siehe isCurrentWeek). Bewusst KEINE Aenderung
// an pctOf: "Soll" ist fuer die laufende Woche immer die volle
// Wochenplanung, "Ist" kann aber nur bereits geloggte Tage enthalten - der
// Prozentsatz wirkt daher bis Sonntag strukturell niedriger, ohne dass der
// Athlet im Rueckstand waere. Statt die Rechnung anzupassen, wird die
// laufende Woche stattdessen optisch abgesetzt (gestrichelter Rand +
// Tooltip-Hinweis), damit der niedrigere Wert nicht als Rueckstand
// missverstanden wird.
const CURRENT_WEEK_START = mondayOf(todayLocalIso());

// Pivotiert die vom Backend flach gelieferte Liste (ein Punkt pro
// Woche x Zone, siehe backend/app/services/training_zones.py:
// compute_weekly_zone_summary) zu einer Zeile pro Woche mit dem
// Erfuellungsgrad (Ist/Plan) der gewaehlten Zone - ein Balken pro Woche,
// wie beim ueber den Gesamtzeitraum aggregierten Plan-vs-Ist (siehe
// ZoneSummaryChart.tsx), statt getrennter Plan-/Ist-Balken je Woche.
// `range` stellt sicher, dass jede Woche des Zeitraums einen Balken erhaelt,
// auch ohne Backend-Datenpunkt (siehe weeksInRange).
function pivotByWeek(data: WeeklyZoneSummary[], zone: string, range: { start: string; end: string }) {
  const byWeek = new Map(data.filter((d) => d.zone === zone).map((d) => [d.week_start, d]));
  return weeksInRange(range.start, range.end).map((week_start) => {
    const d = byWeek.get(week_start);
    const planned = d?.planned ?? 0;
    const actual = d?.actual ?? 0;
    const pct = pctOf(planned, actual);
    return {
      week_start,
      planned,
      actual,
      unit: d?.unit ?? "km",
      pct: pct ?? 0,
      barPct: pct ?? 0,
      hasPlan: pct !== null,
      wasPlanned: planned > 0,
      isCurrentWeek: week_start === CURRENT_WEEK_START,
    };
  });
}

// Wie pivotByWeek, summiert aber ueber die drei km-Zonen statt eine einzelne
// zu zeigen - fuer die "Gesamt (km)"-Option (siehe KM_ZONES oben).
function pivotTotalKmByWeek(data: WeeklyZoneSummary[], range: { start: string; end: string }) {
  const byWeek = new Map<string, { planned: number; actual: number }>();
  for (const d of data) {
    if (d.unit !== "km" || !KM_ZONES.includes(d.zone)) continue;
    const entry = byWeek.get(d.week_start) ?? { planned: 0, actual: 0 };
    entry.planned += d.planned;
    entry.actual += d.actual;
    byWeek.set(d.week_start, entry);
  }
  return weeksInRange(range.start, range.end).map((week_start) => {
    const v = byWeek.get(week_start) ?? { planned: 0, actual: 0 };
    const pct = pctOf(v.planned, v.actual);
    return {
      week_start,
      planned: v.planned,
      actual: v.actual,
      unit: "km" as const,
      pct: pct ?? 0,
      barPct: pct ?? 0,
      hasPlan: pct !== null,
      wasPlanned: v.planned > 0,
      isCurrentWeek: week_start === CURRENT_WEEK_START,
    };
  });
}

export function WeeklyZoneComparisonChart({
  data,
  range,
}: {
  data: WeeklyZoneSummary[];
  range: { start: string; end: string };
}) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const chartHeight = useChartHeight(260);
  const zoneColor: Record<string, string> = {
    GA1: colors.blue,
    Schwelle: colors.amber,
    VO2max: colors.clay,
    "Sprint/Reps": colors.rose,
    Athletik: colors.moss,
    Beweglichkeit: colors.violet,
    Krafttraining: colors.rose,
    "Radfahren (GA1)": colors.teal,
    "Radfahren (Schwelle)": colors.teal,
    "Radfahren (VO2max)": colors.teal,
    "Schwimmen (GA1)": colors.sky,
    "Schwimmen (Schwelle)": colors.sky,
    "Schwimmen (VO2max)": colors.sky,
  };

  // Sportart-Tabs (Laufen/Radfahren/Schwimmen/Sonstiges) - gleiche
  // Gruppierung wie ZoneSummaryChart/der Plan-Editor (lib/plan.ts:
  // TARGET_ZONE_GROUPS). Immer alle Gruppen/Zonen zeigen (nicht nach
  // aktuellen Daten filtern) - sonst waeren z.B. Radfahren/Schwimmen oder
  // einzelne Sonstiges-Zonen nicht anwaehlbar, solange fuer sie im
  // 52-Wochen-Fenster zufaellig gerade nichts geplant/protokolliert ist.
  const [selectedGroup, setSelectedGroup] = useState<string>(TARGET_ZONE_GROUPS[0].label);
  const activeGroup = TARGET_ZONE_GROUPS.some((g) => g.label === selectedGroup)
    ? selectedGroup
    : TARGET_ZONE_GROUPS[0].label;
  const groupZones = TARGET_ZONE_GROUPS.find((g) => g.label === activeGroup)?.zones ?? [];

  const availableZones = ZONE_ORDER.filter((zone) => groupZones.includes(zone));
  const hasKmZones = groupZones.some((z) => KM_ZONES.includes(z));
  const [selectedZone, setSelectedZone] = useState<string>(TOTAL_KM_OPTION);
  const zone =
    selectedZone === TOTAL_KM_OPTION && hasKmZones
      ? TOTAL_KM_OPTION
      : availableZones.includes(selectedZone)
        ? selectedZone
        : availableZones[0];

  const chartData =
    zone === TOTAL_KM_OPTION ? pivotTotalKmByWeek(data, range) : zone ? pivotByWeek(data, zone, range) : [];
  const unit = zone === TOTAL_KM_OPTION || KM_ZONES.includes(zone as string) ? "km" : "minutes";

  // Y-Achse an den hoechsten Balken anpassen statt einer festen 0-120%-Skala
  // (siehe ZoneSummaryChart.tsx fuer dieselbe Begruendung).
  const maxPct = Math.max(100, ...chartData.map((d) => d.pct));
  const yMax = Math.ceil(maxPct / 20) * 20;
  const yTicks = Array.from({ length: yMax / 20 + 1 }, (_, i) => i * 20);

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-ink">Trainingserfüllung</h2>
          <p className="mt-1 text-xs text-mist">Erfüllungsgrad (Ist/Plan) je Zone und Woche.</p>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {TARGET_ZONE_GROUPS.map((g) => (
            <button
              key={g.label}
              type="button"
              className={g.label === activeGroup ? "chip-active" : "chip"}
              onClick={() => setSelectedGroup(g.label)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap gap-1 text-xs">
          {hasKmZones && (
            <button
              type="button"
              className={zone === TOTAL_KM_OPTION ? "chip-active" : "chip"}
              onClick={() => setSelectedZone(TOTAL_KM_OPTION)}
            >
              Gesamt (km)
            </button>
          )}
          {availableZones.map((z) => (
            <button
              key={z}
              type="button"
              className={z === zone ? "chip-active" : "chip"}
              onClick={() => setSelectedZone(z)}
            >
              {ZONE_LABEL[z]}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-mist">Keine geplanten oder protokollierten Einheiten im gewählten Zeitraum.</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="week_start"
              tickFormatter={isoWeekLabel}
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
              unit="%"
              tickFormatter={(v: number) => Math.round(v).toString()}
            />
            {/* Markierung bei 100% (Sollerfuellung), wie bei ZoneSummaryChart. */}
            <ReferenceLine y={100} stroke={colors.mist} strokeDasharray="4 4" />
            <ReferenceLine y={100} label={{ value: "100%", position: "right", fontSize: 10, fill: colors.tick }} stroke="none" />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={barCursorStyle(colors)}
              labelFormatter={isoWeekLabel}
              formatter={(_value: number, _name: string, entry) => {
                const point = entry.payload as (typeof chartData)[number];
                const base = point.wasPlanned
                  ? `${unitLabel(unit, point.actual)} von ${unitLabel(unit, point.planned)} (${point.pct.toFixed(0)}%)`
                  : point.hasPlan
                    ? `${unitLabel(unit, point.actual)} (kein Plan – 100%, da trainiert)`
                    : `${unitLabel(unit, point.actual)} (kein Plan in dieser Woche)`;
                return [point.isCurrentWeek ? `${base} – Woche läuft noch` : base, "Erfüllung"];
              }}
            />
            <Bar dataKey="barPct" radius={[4, 4, 0, 0]} name="Erfüllung">
              {chartData.map((entry) => (
                <Cell
                  key={entry.week_start}
                  fill={zone === TOTAL_KM_OPTION ? colors.moss : zoneColor[zone] ?? colors.moss}
                  fillOpacity={entry.hasPlan ? 1 : 0.25}
                  // Laufende Woche visuell als "in Arbeit" absetzen (siehe
                  // CURRENT_WEEK_START oben) - "Soll" ist fuer sie immer die
                  // volle Wochenplanung, "Ist" strukturell unvollstaendig.
                  stroke={entry.isCurrentWeek ? colors.tick : "none"}
                  strokeDasharray={entry.isCurrentWeek ? "4 4" : undefined}
                  strokeWidth={entry.isCurrentWeek ? 1.5 : 0}
                />
              ))}
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(value: number) => (value > 0 ? `${Math.round(value)}%` : "")}
                style={{ fill: colors.tick, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
