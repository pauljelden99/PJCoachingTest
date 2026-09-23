"use client";

import { addDays, addMonths, firstOfMonth, formatRangeLabel, mondayOf, todayLocalIso } from "@/lib/plan";

export type NavMode = "week" | "month";

// Berechnet das sichtbare [start, end)-Fenster aus Modus + Ankertag - von
// der aufrufenden Seite (z.B. app/training-plan/page.tsx) genutzt, um
// Sessions/Activities/Zonen auf den sichtbaren Zeitraum zu filtern.
export function rangeFor(mode: NavMode, anchor: string): { start: string; end: string } {
  if (mode === "month") {
    const start = firstOfMonth(anchor);
    return { start, end: addMonths(start, 1) };
  }
  const start = mondayOf(anchor);
  return { start, end: addDays(start, 7) };
}

export function WeekMonthNav({
  mode,
  anchor,
  onChange,
}: {
  mode: NavMode;
  anchor: string;
  onChange: (mode: NavMode, anchor: string) => void;
}) {
  const { start, end } = rangeFor(mode, anchor);
  const label = formatRangeLabel(mode, start, end);

  function step(direction: 1 | -1) {
    onChange(mode, mode === "month" ? addMonths(anchor, direction) : addDays(anchor, direction * 7));
  }

  function setMode(next: NavMode) {
    onChange(next, anchor);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-full border border-mist/20">
        <button
          type="button"
          onClick={() => setMode("week")}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            mode === "week" ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
          }`}
        >
          Woche
        </button>
        <button
          type="button"
          onClick={() => setMode("month")}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            mode === "month" ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
          }`}
        >
          Monat
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Zurück"
          className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
        >
          ◀
        </button>
        {/* Auf dem Smartphone schmaler, damit Zeitraum-Umschalter,
            Blaetter-Pfeile und "Heute" in eine Zeile passen. */}
        <span className="min-w-[7rem] text-center text-sm text-ink sm:min-w-[9rem]">{label}</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Vor"
          className="rounded-full px-2 py-1 text-mist transition-colors hover:bg-mist/10 hover:text-ink"
        >
          ▶
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange(mode, todayLocalIso())}
        className="text-xs text-mist transition-colors hover:text-ink"
      >
        Heute
      </button>
    </div>
  );
}
