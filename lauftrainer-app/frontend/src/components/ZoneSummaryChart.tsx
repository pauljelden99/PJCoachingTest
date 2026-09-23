"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { barCursorStyle, getChartColors, tooltipStyle } from "@/lib/chart-theme";
import { TARGET_ZONE_GROUPS } from "@/lib/plan";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { ZoneSummary } from "@/types/training";

// Dieselben Zonenfarben wie ZoneDistribution/WeeklyVolumeChart fuer GA1/
// Schwelle/VO2max (konsistente Farbcodierung ueber alle Zonen-Ansichten),
// ergaenzt um zwei weitere Farben fuer die nicht-lauf-spezifischen
// Einheitstypen Athletik/Beweglichkeit.
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

function unitLabel(unit: string, value: number): string {
  return unit === "minutes" ? `${Math.round(value)} min` : `${value.toFixed(1)} km`;
}

// Vergleicht Plan vs. Ist ueber den gesamten Abfragezeitraum (nicht mehr
// tagesweise, siehe backend/app/services/training_zones.py) - eine Achse
// (Erfuellungsgrad in %) statt getrennter km-/Minuten-Achsen, damit alle
// fuenf Zonen in einem Diagramm vergleichbar bleiben; die absoluten
// Plan-/Ist-Werte stehen als direktes Label ueber jedem Balken.
export function ZoneSummaryChart({ data }: { data: ZoneSummary[] }) {
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

  // Sportart-Tabs (Laufen/Radfahren/Schwimmen/Sonstiges) gruppieren die
  // fein-koernigen Einzelzonen-Chips unten grob nach Sportart, statt sie
  // alle nebeneinander zu zeigen - nutzt dieselbe Gruppierung wie der
  // Plan-Editor (lib/plan.ts:TARGET_ZONE_GROUPS). Immer alle Gruppen/Zonen
  // zeigen (nicht nach aktuellen Daten filtern) - sonst waeren z.B.
  // Radfahren/Schwimmen oder einzelne Sonstiges-Zonen nicht anwaehlbar,
  // solange fuer sie zufaellig gerade nichts geplant/protokolliert ist.
  const [selectedGroup, setSelectedGroup] = useState<string>(TARGET_ZONE_GROUPS[0].label);
  const activeGroup = TARGET_ZONE_GROUPS.some((g) => g.label === selectedGroup)
    ? selectedGroup
    : TARGET_ZONE_GROUPS[0].label;
  const groupZones = TARGET_ZONE_GROUPS.find((g) => g.label === activeGroup)?.zones ?? [];

  const byZone = new Map(data.map((d) => [d.zone, d]));
  const chartData = ZONE_ORDER.filter((zone) => groupZones.includes(zone)).map((zone) => {
    const point = byZone.get(zone);
    const pct = point?.pct ?? 0;
    return {
      zone,
      label: ZONE_LABEL[zone],
      pct,
      barPct: pct,
      planned: point?.planned ?? 0,
      actual: point?.actual ?? 0,
      unit: point?.unit ?? "km",
      hasPlan: (point?.pct ?? null) !== null,
    };
  });

  const hasAnyPlan = chartData.some((d) => d.hasPlan);

  // Y-Achse an den hoechsten Balken anpassen statt einer festen 0-120%-Skala -
  // bei durchgehend niedriger Erfuellung (z.B. Trainingsbeginn) wirkte eine
  // feste 120%-Decke gestaucht und schwer ablesbar. Immer mindestens bis 100%
  // (Referenzlinie fuer volle Sollerfuellung), aufgerundet auf 20er-Schritte.
  const maxPct = Math.max(100, ...chartData.map((d) => d.pct));
  const yMax = Math.ceil(maxPct / 20) * 20;
  const yTicks = Array.from({ length: yMax / 20 + 1 }, (_, i) => i * 20);

  // Gesamtkilometer ueber die lauf-spezifischen Zonen (GA1/Schwelle/VO2max,
  // unit "km") - Athletik/Beweglichkeit laufen ueber Minuten und zaehlen
  // nicht in eine Kilometersumme.
  const totalPlannedKm = chartData.filter((d) => d.unit === "km").reduce((sum, d) => sum + d.planned, 0);
  const totalActualKm = chartData.filter((d) => d.unit === "km").reduce((sum, d) => sum + d.actual, 0);

  return (
    <div className="card">
      <h2 className="mb-1 text-base font-medium text-ink">Trainingserfüllung diese Woche</h2>
      <p className="mb-1 text-xs text-mist">
        Erfüllungsgrad je Zone in der laufenden Kalenderwoche: geplante vs. tatsächlich absolvierte Distanz (GA1/
        Schwelle/VO2max) bzw. Dauer (Athletik/Beweglichkeit).
      </p>
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
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
      {totalPlannedKm > 0 && (
        <p className="mb-4 text-xs font-medium text-ink">
          Gesamt: {totalActualKm.toFixed(1)} von {totalPlannedKm.toFixed(1)} km
        </p>
      )}

      {!hasAnyPlan ? (
        <p className="text-sm text-mist">Keine geplanten Einheiten im gewählten Zeitraum.</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
              unit="%"
              tickFormatter={(v: number) => Math.round(v).toString()}
            />
            {/* Markierung bei 100% (Sollerfuellung) auf der an den hoechsten Balken angepassten Achse. */}
            <ReferenceLine y={100} stroke={colors.mist} strokeDasharray="4 4" />
            <ReferenceLine y={100} label={{ value: "100%", position: "right", fontSize: 10, fill: colors.tick }} stroke="none" />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={barCursorStyle(colors)}
              formatter={(_value: number, _name: string, entry) => {
                const point = entry.payload as (typeof chartData)[number];
                return [
                  point.hasPlan
                    ? `${unitLabel(point.unit, point.actual)} von ${unitLabel(point.unit, point.planned)} (${point.pct.toFixed(0)}%)`
                    : `${unitLabel(point.unit, point.actual)} (kein Plan im Zeitraum)`,
                  point.label,
                ];
              }}
            />
            <Bar dataKey="barPct" radius={[4, 4, 0, 0]} name="Erfüllung">
              {chartData.map((entry) => (
                <Cell key={entry.zone} fill={zoneColor[entry.zone]} fillOpacity={entry.hasPlan ? 1 : 0.25} />
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
