export type DataSource = "strava" | "manual";

export interface Activity {
  id: number;
  source: DataSource;
  day: string; // ISO-Datum
  start_time: string;
  duration_s: number;
  distance_m: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  // Subjektiv empfundene Anstrengung (0-10) - reine Notiz, geht nicht in
  // daily_load ein (siehe backend/app/services/training_load.py).
  rpe: number | null;
  daily_load: number;
  zone_km: Record<string, number>;
  // Dieselben Planungsfelder wie bei PlannedSession - eine protokollierte
  // Einheit nutzt im Formular dieselben Felder wie das Planen einer
  // Einheit (siehe components/PlanSessionFields.tsx).
  title: string;
  description: string;
  target_zone: string | null;
  // Methodik-Variante der Zielzone (aktuell nur "Fahrtspiel" fuer
  // target_zone="Schwelle") - siehe lib/plan.ts:METHODS_BY_ZONE.
  method: string | null;
  segments: PlanSegment[];
}

export interface PmcPoint {
  day: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export type UserRole = "athlete" | "trainer" | "admin";

export type Gender = "male" | "female" | "diverse";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  // Nur fuer role="trainer" relevant: Admin-Rechte (Konten anlegen, siehe
  // backend/app/core/deps.py:require_admin). role="admin" hat sie immer,
  // unabhaengig von diesem Feld.
  is_admin: boolean;
  hr_rest: number | null;
  hr_max: number | null;
  trimp_exponent_factor: number | null;
  trimp_weight_factor: number | null;
  load_k: number | null;
  cs_use_vlt3: boolean;
  pace_zones_manual: boolean;
  threshold_pace_sec_per_km: number | null;
  vo2max_pace_sec_per_km: number | null;
  easy_pace_sec_per_km: number | null;
  marathon_pace_sec_per_km: number | null;
  repetition_pace_sec_per_km: number | null;
  easy_pace_min_sec_per_km: number | null;
  easy_pace_max_sec_per_km: number | null;
  marathon_pace_min_sec_per_km: number | null;
  marathon_pace_max_sec_per_km: number | null;
  threshold_pace_min_sec_per_km: number | null;
  threshold_pace_max_sec_per_km: number | null;
  vo2max_pace_min_sec_per_km: number | null;
  vo2max_pace_max_sec_per_km: number | null;
  repetition_pace_min_sec_per_km: number | null;
  repetition_pace_max_sec_per_km: number | null;
  vlt3_pace_sec_per_km: number | null;
  vla_max: number | null;
  vo2max_measured: number | null;
  ftp_watts: number | null;
  warmup_pace_sec_per_km: number | null;
  cooldown_pace_sec_per_km: number | null;
  warmup_watts: number | null;
  cooldown_watts: number | null;
  race_100m_time_s: number | null;
  race_400m_time_s: number | null;
  race_800m_time_s: number | null;
  race_1500m_time_s: number | null;
  race_5k_time_s: number | null;
  race_10k_time_s: number | null;
  race_hm_time_s: number | null;
  race_marathon_time_s: number | null;
  zones_last_updated: string | null;
  birth_date: string | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  weekly_rhythm_note: string | null;
  goal_race_name: string | null;
  goal_race_date: string | null;
  goal_time_s: number | null;
  goals_note: string | null;
  notes: string | null;
  // Kleines Profilbild als Data-URL (siehe components/AvatarUpload.tsx),
  // clientseitig bereits herunterskaliert.
  avatar: string | null;
  created_at: string;
}

// User plus aus den Bestzeiten berechnete physiologische Kennwerte (siehe
// backend/app/schemas/user.py:AthleteProfileOut) - NUR von
// GET/PUT /api/trainer/athletes/{id} geliefert (Trainer-Sicht auf ein
// Athletenprofil). Der Athlet selbst (GET/PUT /api/auth/me) bekommt
// weiterhin nur das einfache User zurueck, ohne diese drei Felder.
export interface AthleteProfile extends User {
  critical_speed_mps: number | null;
  d_prime_m: number | null;
  riegel_b: number | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type SegmentType = "warmup" | "steady" | "interval" | "jog_recovery" | "rest" | "cooldown";

export interface PlanSegment {
  type: SegmentType;
  repeat: number;
  distance_km: number | null;
  // Alternative zu distance_km fuer zeitbasierte Intervalle (z.B. "4min
  // Schwelle" statt "1km Schwelle") - im UI gegenseitig exklusiv, siehe
  // components/SegmentEditor.tsx.
  duration_s: number | null;
  pace: string; // "mm:ss" pro km, frei eingegeben, z.B. "4:30" - Laufeinheiten
  // Watt-Zielwert fuer Radeinheiten (lib/wattZones.ts) - Alternative zu pace.
  watts: number | null;
  zone: string | null;
  note: string;
}

export interface PlannedSession {
  id: number;
  athlete_id: number;
  day: string;
  title: string;
  description: string;
  target_zone: string | null;
  // Methodik-Variante der Zielzone (aktuell nur "Fahrtspiel" fuer
  // target_zone="Schwelle") - siehe lib/plan.ts:METHODS_BY_ZONE.
  method: string | null;
  target_distance_km: number | null;
  // Alternative zu target_distance_km fuer "Athletik"/"Beweglichkeit" -
  // siehe lib/plan.ts:zoneUsesDuration.
  target_duration_s: number | null;
  // "mm:ss"/km, v.a. fuer GA1-Laeufe ohne Segmente (editierbar, siehe
  // components/PlanSessionFields.tsx) - bei strukturierten Einheiten steckt
  // das Tempo stattdessen pro Segment in segments[].pace.
  target_pace: string;
  segments: PlanSegment[];
}

export interface PlannedSessionInput {
  day: string;
  title: string;
  description?: string;
  target_zone?: string | null;
  method?: string | null;
  target_distance_km?: number | null;
  target_duration_s?: number | null;
  target_pace?: string;
  segments?: PlanSegment[];
}

export interface AthletePlanOverview {
  athlete_id: number;
  athlete_name: string;
  sessions: PlannedSession[];
}

export interface AthleteSummary {
  id: number;
  name: string;
  email: string;
  last_activity_day: string | null;
  ctl: number;
  atl: number;
  tsb: number;
  threshold_pace_sec_per_km: number | null;
  vo2max_pace_sec_per_km: number | null;
  ftp_watts: number | null;
  warmup_pace_sec_per_km: number | null;
  cooldown_pace_sec_per_km: number | null;
  warmup_watts: number | null;
  cooldown_watts: number | null;
  race_5k_time_s: number | null;
  race_10k_time_s: number | null;
  race_hm_time_s: number | null;
  race_marathon_time_s: number | null;
}

export interface Vo2maxPoint {
  day: string;
  activity_id: number;
  vo2max: number;
}

export interface WeeklyVolumePoint {
  week_start: string;
  km: number;
  minutes: number;
}

export interface WeeklyVolumeByZonePoint {
  week_start: string;
  GA1: number;
  Schwelle: number;
  VO2max: number;
}

export interface WeeklyVolumeBySportPoint {
  week_start: string;
  sport: "run" | "bike" | "swim";
  km: number;
  minutes: number;
}

export type RacePredictions = Record<"5k" | "10k" | "half_marathon" | "marathon", number>;

export interface WorkloadRiskPoint {
  day: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number;
  risk: "unterbelastung" | "optimal" | "erhoeht" | "hoch" | "unbekannt";
  // Relativer Verletzungsrisiko-Multiplikator zur A:C-Ratio (Blanch &
  // Gabbett 2016) - null bei risk === "unbekannt" (keine Trainingshistorie).
  risk_multiplier: number | null;
}

export interface AnalyticsResponse {
  vo2max_series: Vo2maxPoint[];
  weekly_volume: WeeklyVolumePoint[];
  weekly_volume_by_zone: WeeklyVolumeByZonePoint[];
  weekly_volume_by_sport: WeeklyVolumeBySportPoint[];
  predictions: Partial<RacePredictions>;
  workload: WorkloadRiskPoint[];
}

export interface ZoneMinutes {
  zone: string;
  minutes: number;
}

export interface ZoneKm {
  zone: string;
  km: number;
}

export interface ZoneSummary {
  zone: string;
  unit: "km" | "minutes";
  planned: number;
  actual: number;
  pct: number | null;
}

export interface WeeklyZoneSummary {
  week_start: string;
  zone: string;
  unit: "km" | "minutes";
  planned: number;
  actual: number;
}

export interface TrainingZonesResponse {
  pace_zone_minutes: ZoneMinutes[];
  pace_zone_km: ZoneKm[];
  hr_zone_minutes: ZoneMinutes[];
  zone_summary: ZoneSummary[];
  weekly_zone_summary: WeeklyZoneSummary[];
  weekly_pace_zone_minutes: WeeklyZoneSummary[];
  pace_zones_available: boolean;
  hr_zones_available: boolean;
}

export interface MonthStats {
  month: number; // 1-12
  avg_km_per_week: number;
  pct_ga1: number | null;
  pct_schwelle: number | null;
  pct_vo2max: number | null;
  mean_effective_vo2max: number | null;
  sonstige_avg_h_per_week: number;
}

export interface YearStats {
  year: number;
  avg_km_per_week: number;
  pct_ga1: number | null;
  pct_schwelle: number | null;
  pct_vo2max: number | null;
  mean_effective_vo2max: number | null;
  sonstige_avg_h_per_week: number;
  months: MonthStats[];
}

export interface PeriodStatsResponse {
  years: YearStats[];
}

export interface CalendarNote {
  day: string;
  note: string;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface ManualActivityInput {
  day: string;
  start_time: string;
  duration_s: number;
  distance_m?: number | null;
  avg_hr?: number | null;
  elevation_gain_m?: number | null;
  rpe?: number | null;
  athlete_id?: number;
  title?: string;
  description?: string;
  target_zone?: string | null;
  method?: string | null;
  segments?: PlanSegment[];
}

export interface ActivityUpdateInput {
  day?: string;
  start_time?: string;
  duration_s?: number;
  distance_m?: number | null;
  avg_hr?: number | null;
  elevation_gain_m?: number | null;
  rpe?: number | null;
  title?: string;
  description?: string;
  target_zone?: string | null;
  method?: string | null;
  segments?: PlanSegment[];
}

export interface UserProfileUpdate {
  name?: string;
  email?: string;
  hr_rest?: number | null;
  hr_max?: number | null;
  trimp_exponent_factor?: number | null;
  trimp_weight_factor?: number | null;
  load_k?: number | null;
  cs_use_vlt3?: boolean | null;
  pace_zones_manual?: boolean | null;
  threshold_pace_sec_per_km?: number | null;
  vo2max_pace_sec_per_km?: number | null;
  easy_pace_sec_per_km?: number | null;
  marathon_pace_sec_per_km?: number | null;
  repetition_pace_sec_per_km?: number | null;
  easy_pace_min_sec_per_km?: number | null;
  easy_pace_max_sec_per_km?: number | null;
  marathon_pace_min_sec_per_km?: number | null;
  marathon_pace_max_sec_per_km?: number | null;
  threshold_pace_min_sec_per_km?: number | null;
  threshold_pace_max_sec_per_km?: number | null;
  vo2max_pace_min_sec_per_km?: number | null;
  vo2max_pace_max_sec_per_km?: number | null;
  repetition_pace_min_sec_per_km?: number | null;
  repetition_pace_max_sec_per_km?: number | null;
  vlt3_pace_sec_per_km?: number | null;
  vla_max?: number | null;
  vo2max_measured?: number | null;
  ftp_watts?: number | null;
  warmup_pace_sec_per_km?: number | null;
  cooldown_pace_sec_per_km?: number | null;
  warmup_watts?: number | null;
  cooldown_watts?: number | null;
  race_100m_time_s?: number | null;
  race_400m_time_s?: number | null;
  race_800m_time_s?: number | null;
  race_1500m_time_s?: number | null;
  race_5k_time_s?: number | null;
  race_10k_time_s?: number | null;
  race_hm_time_s?: number | null;
  race_marathon_time_s?: number | null;
  birth_date?: string | null;
  gender?: Gender | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  weekly_rhythm_note?: string | null;
  goal_race_name?: string | null;
  goal_race_date?: string | null;
  goal_time_s?: number | null;
  goals_note?: string | null;
  notes?: string | null;
  avatar?: string | null;
}

export interface PasswordChangeInput {
  current_password: string;
  new_password: string;
}

export interface TrainerCreateInput {
  name: string;
  email: string;
  password: string;
  is_admin: boolean;
}

export interface AthleteCreateInput {
  name: string;
  email: string;
  password: string;
}

export interface DailyWellness {
  day: string;
  resting_hr: number | null;
  hrv: number | null;
  sleep_duration_h: number | null;
  sleep_quality: number | null;
}

export interface DailyWellnessInput {
  resting_hr?: number | null;
  hrv?: number | null;
  sleep_duration_h?: number | null;
  sleep_quality?: number | null;
}

export interface WellnessBaselinePoint {
  day: string;
  value: number | null;
  baseline_mean: number | null;
  baseline_lower: number | null;
  baseline_upper: number | null;
}

export interface WellnessSeriesResponse {
  resting_hr: WellnessBaselinePoint[];
  hrv: WellnessBaselinePoint[];
  sleep_duration_h: WellnessBaselinePoint[];
  sleep_quality: WellnessBaselinePoint[];
}
