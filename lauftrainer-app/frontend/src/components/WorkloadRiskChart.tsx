"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  activeDotStyle,
  barCursorStyle,
  getChartColors,
  lineCursorStyle,
  roundTick,
  tooltipStyle,
} from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme-context";
import { useChartHeight } from "@/lib/useMediaQuery";
import type { WorkloadRiskPoint } from "@/types/training";

const RISK_LABEL: Record<WorkloadRiskPoint["risk"], string> = {
  unterbelastung: "Unterbelastung",
  optimal: "Optimale Zone",
  erhoeht: "Erhöhtes Risiko",
  hoch: "Hohes Risiko",
  unbekannt: "Noch keine Daten",
};

type Metric = "ctl_atl" | "tsb" | "load" | "acwr" | "risk";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "ctl_atl", label: "CTL/ATL" },
  { value: "tsb", label: "TSB" },
  { value: "load", label: "Tageslast" },
  { value: "acwr", label: "A:C Ratio" },
  { value: "risk", label: "Verletzungsrisiko" },
];

export function WorkloadRiskChart({ data }: { data: WorkloadRiskPoint[] }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const chartHeight = useChartHeight(280);
  const [metric, setMetric] = useState<Metric>("ctl_atl");
  const riskColor: Record<WorkloadRiskPoint["risk"], string> = {
    unterbelastung: colors.blue,
    optimal: colors.moss,
    erhoeht: colors.amber,
    hoch: colors.danger,
    unbekannt: colors.mist,
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;

  // Zeigt den heutigen (=letzten) Wert der gerade ausgewaehlten Kennzahl
  // rechts oben an, statt wie frueher immer nur Risiko/A:C unabhaengig
  // vom aktiven Tab - bei "Verletzungsrisiko" bleibt die risikoeingefaerbte
  // Badge, bei den uebrigen Metriken ein neutral eingefaerbter Wert.
  const latestBadge = latest && (
    metric === "acwr" || metric === "risk" ? (
      <div
        className="rounded-full px-3 py-1 text-xs font-medium"
        style={{ backgroundColor: `${riskColor[latest.risk]}26`, color: riskColor[latest.risk] }}
      >
        {RISK_LABEL[latest.risk]}
        {latest.risk !== "unbekannt" && (
          <>
            {" "}
            &middot;{" "}
            {metric === "risk" && latest.risk_multiplier != null
              ? `x${latest.risk_multiplier.toFixed(2)}`
              : `A:C ${latest.acwr.toFixed(2)}`}
          </>
        )}
      </div>
    ) : (
      <div className="rounded-full bg-mist/10 px-3 py-1 text-xs font-medium text-ink">
        Heute:{" "}
        {metric === "ctl_atl"
          ? `CTL ${latest.ctl.toFixed(1)} · ATL ${latest.atl.toFixed(1)}`
          : metric === "tsb"
            ? `TSB ${latest.tsb.toFixed(1)}`
            : `Last ${latest.load.toFixed(0)}`}
      </div>
    )
  );

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-ink">Belastungssteuerung</h2>
          <p className="text-xs text-mist">CTL (Fitness), ATL (Fatigue), TSB (Form), A:C Workload Ratio und Verletzungsrisiko</p>
        </div>
        {latestBadge}
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-full border border-mist/20 p-0.5 w-fit">
        {METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMetric(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              metric === opt.value ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        {metric === "ctl_atl" ? (
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} tickFormatter={roundTick} />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              formatter={(value: number) => value.toFixed(1)}
            />
            <Line
              type="monotone"
              dataKey="ctl"
              stroke={colors.moss}
              strokeWidth={2}
              dot={false}
              activeDot={activeDotStyle(colors, colors.moss)}
              name="CTL (Fitness)"
            />
            <Line
              type="monotone"
              dataKey="atl"
              stroke={colors.clay}
              strokeWidth={2}
              dot={false}
              activeDot={activeDotStyle(colors, colors.clay)}
              name="ATL (Fatigue)"
            />
          </ComposedChart>
        ) : metric === "tsb" ? (
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} tickFormatter={roundTick} />
            <ReferenceLine y={0} stroke={colors.grid} />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              formatter={(value: number) => value.toFixed(1)}
            />
            <Line
              type="monotone"
              dataKey="tsb"
              stroke={colors.mist}
              strokeWidth={2}
              dot={false}
              activeDot={activeDotStyle(colors, colors.mist)}
              name="TSB (Form)"
            />
          </ComposedChart>
        ) : metric === "load" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} tickFormatter={roundTick} />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={barCursorStyle(colors)}
              formatter={(value: number) => value.toFixed(0)}
            />
            <Bar dataKey="load" fill={colors.blue} radius={[4, 4, 0, 0]} name="Tageslast" />
          </BarChart>
        ) : metric === "acwr" ? (
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
              domain={[0, 2]}
              // Feste 0.5er-Schritte statt roundTick (rundet auf ganze
              // Zahlen, z.B. bei einem von recharts automatisch gewaehlten
              // 0.5-Tick) - bei einer Kennzahl mit Zielband 0.8-1.3 sind
              // 0.5/1.0/1.5/... aussagekraeftiger als nur 0/1/2.
              ticks={[0, 0.5, 1, 1.5, 2]}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <ReferenceArea y1={0.8} y2={1.3} fill={colors.moss} fillOpacity={0.08} />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              formatter={(value: number) => value.toFixed(2)}
            />
            <Line
              type="monotone"
              dataKey="acwr"
              stroke={colors.danger}
              strokeWidth={2}
              dot={{ r: 3, fill: colors.danger, strokeWidth: 0 }}
              activeDot={activeDotStyle(colors, colors.danger)}
              name="A:C Ratio"
            />
          </ComposedChart>
        ) : (
          // "Verletzungsrisiko": Punktdiagramm wie der TSB-Tab (ComposedChart
          // mit ReferenceLine als Nulllinie), aber statt der A:C-Ratio der
          // relative Verletzungsrisiko-Multiplikator (relative_injury_risk
          // in backend/app/services/analytics.py, Tabelle nach Blanch &
          // Gabbett 2016) - je Punkt in der Risikofarbe (riskColor) statt
          // einer durchgezogenen Linie, da der Multiplikator nicht linear
          // zwischen den Tagen interpoliert werden soll.
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.grid} />
            <YAxis
              tick={{ fontSize: 12, fill: colors.tick }}
              stroke={colors.grid}
              tickFormatter={(v: number) => `${v.toFixed(1)}x`}
            />
            <ReferenceLine
              y={1}
              stroke={colors.grid}
              strokeDasharray="4 4"
              label={{ value: "Ausgangswert", position: "insideTopLeft", fontSize: 11, fill: colors.mist }}
            />
            <Tooltip
              {...tooltipStyle(colors)}
              cursor={lineCursorStyle(colors)}
              formatter={(value: number, _name: string, entry) => {
                const point = entry.payload as WorkloadRiskPoint;
                return [
                  value == null ? "–" : `x${value.toFixed(2)} (${RISK_LABEL[point.risk]})`,
                  "Verletzungsrisiko",
                ];
              }}
            />
            <Scatter dataKey="risk_multiplier" name="Verletzungsrisiko" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.day} fill={riskColor[d.risk]} />
              ))}
            </Scatter>
          </ComposedChart>
        )}
      </ResponsiveContainer>
      {metric === "risk" && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
          {(Object.keys(RISK_LABEL) as WorkloadRiskPoint["risk"][])
            .filter((r) => r !== "unbekannt")
            .map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskColor[r] }} />
                {RISK_LABEL[r]}
              </span>
            ))}
        </div>
      )}
      <p className="mt-2 text-xs text-mist">
        {metric === "risk" ? (
          <>
            x1.00 = Ausgangs-Verletzungsrisiko bei A:C 0.50, niedrigster Punkt bei A:C&nbsp;1.00
            (x0.66); sowohl deutlich niedrigere als auch höhere A:C-Werte erhöhen das relative Risiko.{" "}
          </>
        ) : (
          <>
            Grüner Bereich = optimale A:C-Zone (0.8&ndash;1.3, &bdquo;sweet spot&ldquo;). Deutlich darüber
            (&gt;1.5, &bdquo;danger zone&ldquo;) oder darunter (&lt;0.8) ist mit erhöhtem Verletzungsrisiko
            assoziiert.{" "}
          </>
        )}
        CTL/ATL/TSB nach dem Performance-Management-Modell (Coggan &amp; Allen, TrainingPeaks); A:C Workload
        Ratio, Verletzungsrisiko-Einstufung und relativer Risiko-Multiplikator nach Blanch, P. &amp; Gabbett, T.
        (2016): &bdquo;Has the athlete trained enough to return to play safely? The acute:chronic workload ratio
        permits clinicians to quantify a player&apos;s risk of subsequent injury&ldquo;, British Journal of
        Sports Medicine, 50(8), 471&ndash;475, doi: 10.1136/bjsports-2015-095445.
      </p>
    </div>
  );
}
