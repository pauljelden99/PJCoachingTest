from datetime import date

from pydantic import BaseModel


class Vo2maxPointOut(BaseModel):
    day: date
    activity_id: int
    vo2max: float


class WeeklyVolumeOut(BaseModel):
    week_start: date
    km: float
    minutes: float


class WeeklyVolumeByZoneOut(BaseModel):
    week_start: date
    GA1: float
    Schwelle: float
    VO2max: float


class WeeklyVolumeBySportOut(BaseModel):
    week_start: date
    sport: str
    km: float
    minutes: float


class WorkloadRiskPointOut(BaseModel):
    day: date
    load: float
    ctl: float
    atl: float
    tsb: float
    acwr: float
    risk: str
    risk_multiplier: float | None


class MonthStatsOut(BaseModel):
    month: int
    avg_km_per_week: float
    pct_ga1: float | None
    pct_schwelle: float | None
    pct_vo2max: float | None
    mean_effective_vo2max: float | None
    sonstige_avg_h_per_week: float


class YearStatsOut(BaseModel):
    year: int
    avg_km_per_week: float
    pct_ga1: float | None
    pct_schwelle: float | None
    pct_vo2max: float | None
    mean_effective_vo2max: float | None
    sonstige_avg_h_per_week: float
    months: list[MonthStatsOut]


class PeriodStatsOut(BaseModel):
    years: list[YearStatsOut]


class AnalyticsOut(BaseModel):
    vo2max_series: list[Vo2maxPointOut]
    weekly_volume: list[WeeklyVolumeOut]
    weekly_volume_by_zone: list[WeeklyVolumeByZoneOut]
    weekly_volume_by_sport: list[WeeklyVolumeBySportOut]
    predictions: dict[str, float]
    workload: list[WorkloadRiskPointOut]
