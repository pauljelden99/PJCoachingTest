export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Trainingsdauer als "hh:mm" (z.B. "5:20" statt "320 min") - fuer
// Wochensummen im Trainingsverlauf-Chart, wo Minutenangaben bei mehreren
// Trainingsstunden pro Woche unhandlich zu lesen sind.
export function formatHoursMinutes(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

// Wettkampfzeit-Formatierung fuers Profilformular (Eingabe/Anzeige als
// "mm:ss" bzw. "h:mm:ss") - siehe components/AthleteProfileForm.tsx.
export function formatRaceTime(seconds: number | null): string {
  if (seconds === null) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function parseRaceTime(value: string): number | null {
  if (!value.trim()) return null;
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Schlafdauer wird als "HH:MM" erfasst (siehe components/DailyWellnessForm.tsx,
// <input type="time">), gespeichert wird weiterhin sleep_duration_h als
// Dezimalstunden (kein Migrationsaufwand, siehe models/daily_wellness.py).
export function formatSleepDuration(hours: number | null | undefined): string {
  if (hours == null) return "";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function parseSleepDuration(hhmm: string): number | null {
  const match = hhmm.trim().match(/^(\d{1,2}):([0-5]?\d)$/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}
