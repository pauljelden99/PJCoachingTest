import type {
  Activity,
  ActivityUpdateInput,
  AnalyticsResponse,
  AthleteCreateInput,
  AthletePlanOverview,
  AthleteProfile,
  AthleteSummary,
  AuthResponse,
  CalendarNote,
  DailyWellness,
  DailyWellnessInput,
  ManualActivityInput,
  PasswordChangeInput,
  PeriodStatsResponse,
  PlannedSession,
  PlannedSessionInput,
  PmcPoint,
  TrainerCreateInput,
  TrainingZonesResponse,
  User,
  UserProfileUpdate,
  WellnessSeriesResponse,
} from "@/types/training";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, detail?.detail ?? `Anfrage an ${path} fehlgeschlagen (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// --- Auth ---------------------------------------------------------------

export function login(email: string, password: string): Promise<AuthResponse> {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}

export function getMe(token: string): Promise<User> {
  return request("/api/auth/me", { token });
}

export function createTrainer(payload: TrainerCreateInput, token: string): Promise<User> {
  return request("/api/auth/trainers", { method: "POST", body: payload, token });
}

export function createAthlete(payload: AthleteCreateInput, token: string): Promise<User> {
  return request("/api/auth/athletes", { method: "POST", body: payload, token });
}

export function updateProfile(payload: UserProfileUpdate, token: string): Promise<User> {
  return request("/api/auth/me", { method: "PUT", body: payload, token });
}

export function changePassword(payload: PasswordChangeInput, token: string): Promise<void> {
  return request("/api/auth/me/password", { method: "PUT", body: payload, token });
}

export function deleteAccount(payload: { password: string }, token: string): Promise<void> {
  return request("/api/auth/me", { method: "DELETE", body: payload, token });
}

export function requestPasswordReset(email: string): Promise<void> {
  return request("/api/auth/forgot-password", { method: "POST", body: { email } });
}

export function confirmPasswordReset(tokenValue: string, newPassword: string): Promise<void> {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: { token: tokenValue, new_password: newPassword },
  });
}

// --- Activities / Training Load ------------------------------------------

export function getTrainingLoad(athleteId: number, token: string): Promise<PmcPoint[]> {
  return request(`/api/training-load/${athleteId}`, { token });
}

export function getActivities(athleteId: number, token: string): Promise<Activity[]> {
  return request(`/api/activities/${athleteId}`, { token });
}

export function createManualActivity(payload: ManualActivityInput, token: string): Promise<Activity> {
  return request("/api/activities/manual", { method: "POST", body: payload, token });
}

export function updateActivity(id: number, payload: ActivityUpdateInput, token: string): Promise<Activity> {
  return request(`/api/activities/${id}`, { method: "PUT", body: payload, token });
}

export function deleteActivity(id: number, token: string): Promise<void> {
  return request(`/api/activities/${id}`, { method: "DELETE", token });
}

// --- Training Plans --------------------------------------------------------

export function getTrainingPlan(athleteId: number, token: string): Promise<PlannedSession[]> {
  return request(`/api/training-plans/${athleteId}`, { token });
}

export function createPlannedSession(
  athleteId: number,
  payload: PlannedSessionInput,
  token: string
): Promise<PlannedSession> {
  return request("/api/training-plans/", { method: "POST", body: { athlete_id: athleteId, ...payload }, token });
}

export function updatePlannedSession(
  id: number,
  payload: Partial<PlannedSessionInput>,
  token: string
): Promise<PlannedSession> {
  return request(`/api/training-plans/${id}`, { method: "PUT", body: payload, token });
}

export function deletePlannedSession(id: number, token: string): Promise<void> {
  return request(`/api/training-plans/${id}`, { method: "DELETE", token });
}

// --- Trainer ---------------------------------------------------------------

export function getAthletes(token: string): Promise<AthleteSummary[]> {
  return request("/api/trainer/athletes", { token });
}

export function getAthleteProfile(athleteId: number, token: string): Promise<AthleteProfile> {
  return request(`/api/trainer/athletes/${athleteId}`, { token });
}

export function updateAthleteProfile(
  athleteId: number,
  payload: UserProfileUpdate,
  token: string
): Promise<AthleteProfile> {
  return request(`/api/trainer/athletes/${athleteId}`, { method: "PUT", body: payload, token });
}

export function deleteAthlete(athleteId: number, token: string): Promise<void> {
  return request(`/api/trainer/athletes/${athleteId}`, { method: "DELETE", token });
}

export function getPlansOverview(
  range: { start: string; end: string },
  token: string
): Promise<AthletePlanOverview[]> {
  return request(`/api/trainer/plans-overview?start=${range.start}&end=${range.end}`, { token });
}

// --- Analytics ---------------------------------------------------------------

// `days`: rollierendes Fenster - `start`/`end`: festes [start, end)-Fenster
// (Dashboard-Monats-/Jahresauswahl). CTL/ATL (`workload`) werden serverseitig
// immer aus der vollen Historie berechnet und erst danach auf den Zeitraum
// gekuerzt; die uebrigen Felder direkt (siehe backend/app/api/analytics.py).
// Ohne Parameter volle Historie wie bisher.
export function getAnalytics(
  athleteId: number,
  token: string,
  range?: { days: number } | { start: string; end: string }
): Promise<AnalyticsResponse> {
  const query = range ? "days" in range ? `?days=${range.days}` : `?start=${range.start}&end=${range.end}` : "";
  return request(`/api/analytics/${athleteId}${query}`, { token });
}

// Jahres-/Monatsstatistik ("Trainingsjahre"-Tabelle) - bewusst ohne
// Zeitraum-Parameter, liefert immer die komplette Historie auf einmal
// (siehe backend/app/api/analytics.py:get_period_stats).
export function getPeriodStats(athleteId: number, token: string): Promise<PeriodStatsResponse> {
  return request(`/api/analytics/${athleteId}/period-stats`, { token });
}

// --- Trainingszonen ----------------------------------------------------------

// `days`: rollierendes Fenster (Dashboard) - `start`/`end`: festes
// [start, end)-Fenster fuer die Wochen-/Monatsnavigation im Trainingsplan
// (siehe app/training-plan/page.tsx), siehe backend/app/api/training_zones.py.
export function getTrainingZones(
  athleteId: number,
  params: { days: number } | { start: string; end: string },
  token: string
): Promise<TrainingZonesResponse> {
  const query =
    "days" in params ? `days=${params.days}` : `start=${params.start}&end=${params.end}`;
  return request(`/api/training-zones/${athleteId}?${query}`, { token });
}

// --- Jahresplaner --------------------------------------------------------

export function getCalendarNotes(
  athleteId: number,
  start: string,
  end: string,
  token: string
): Promise<CalendarNote[]> {
  return request(`/api/calendar-notes/${athleteId}?start=${start}&end=${end}`, { token });
}

export function upsertCalendarNote(
  athleteId: number,
  day: string,
  note: string,
  token: string
): Promise<CalendarNote> {
  return request(`/api/calendar-notes/${athleteId}/${day}`, { method: "PUT", body: { note }, token });
}

// --- Wellness (Ruhepuls, HRV, Schlaf) -------------------------------------

export function getWellnessEntries(
  athleteId: number,
  start: string,
  end: string,
  token: string
): Promise<DailyWellness[]> {
  return request(`/api/wellness/${athleteId}?start=${start}&end=${end}`, { token });
}

export function upsertWellness(
  athleteId: number,
  day: string,
  payload: DailyWellnessInput,
  token: string
): Promise<DailyWellness> {
  return request(`/api/wellness/${athleteId}/${day}`, { method: "PUT", body: payload, token });
}

export function getWellnessSeries(
  athleteId: number,
  range: { days: number } | { start: string; end: string },
  token: string
): Promise<WellnessSeriesResponse> {
  const query = "days" in range ? `days=${range.days}` : `start=${range.start}&end=${range.end}`;
  return request(`/api/wellness/${athleteId}/series?${query}`, { token });
}
