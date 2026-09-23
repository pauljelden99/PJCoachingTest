"use client";

import { addDays, MONTH_LABELS, mondayOf, todayLocalIso, WEEKDAY_LABELS } from "@/lib/plan";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function YearMonthGrid({
  year,
  month,
  notedDays,
  sessionDays,
  activityDays,
  selectedDay,
  onSelectDay,
  notesByDay,
  size = "compact",
}: {
  year: number;
  month: number; // 0-indexed
  notedDays: Set<string>;
  sessionDays: Set<string>;
  activityDays: Set<string>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  // Nur in der Monatsansicht befuellt: zeigt den Notiztext direkt in der
  // Zelle an, statt ihn erst nach Auswahl im Seitenpanel zu zeigen (siehe
  // app/year-planner/page.tsx).
  notesByDay?: Map<string, string>;
  size?: "compact" | "large";
}) {
  const monthStart = `${year}-${pad(month + 1)}-01`;
  const gridStart = mondayOf(monthStart);
  const today = todayLocalIso();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const large = size === "large";

  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-medium text-ink">
        {MONTH_LABELS[month]} {year}
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-mist">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{large ? label : label.slice(0, 2)}</div>
        ))}
      </div>
      <div className={`mt-1 grid grid-cols-7 gap-1 ${large ? "auto-rows-fr" : ""}`}>
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === monthStart.slice(0, 7);
          const dayNum = Number(day.slice(8, 10));
          const hasNote = notedDays.has(day);
          const hasSession = sessionDays.has(day);
          const hasActivity = activityDays.has(day);
          const isToday = day === today;
          const isSelected = day === selectedDay;
          const noteText = large ? notesByDay?.get(day) : undefined;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`relative rounded-md text-left text-xs transition-colors ${
                large ? "min-h-[5.5rem] p-1.5" : "aspect-square"
              } ${!inMonth ? "text-mist/30" : "text-ink"} ${
                isSelected ? "bg-moss/20 text-moss" : hasNote ? "bg-clay/10" : "hover:bg-mist/10"
              } ${isToday ? "ring-1 ring-moss/50" : ""}`}
            >
              <span className={large ? "flex items-center justify-between" : ""}>
                {dayNum}
                {large && (hasSession || hasActivity) && (
                  <span className="flex gap-0.5">
                    {hasSession && <span className="h-1 w-1 rounded-full bg-clay" />}
                    {hasActivity && <span className="h-1 w-1 rounded-full bg-moss" />}
                  </span>
                )}
              </span>
              {noteText && <p className="mt-1 line-clamp-3 whitespace-normal text-[10px] text-clay">{noteText}</p>}
              {!large && (hasSession || hasActivity) && (
                <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {hasSession && <span className="h-1 w-1 rounded-full bg-clay" />}
                  {hasActivity && <span className="h-1 w-1 rounded-full bg-moss" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
