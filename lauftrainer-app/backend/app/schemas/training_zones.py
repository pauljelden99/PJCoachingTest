from datetime import date

from pydantic import BaseModel


class ZoneMinutesOut(BaseModel):
    zone: str
    minutes: float


class ZoneKmOut(BaseModel):
    zone: str
    km: float


class ZoneSummaryOut(BaseModel):
    zone: str
    unit: str  # "km" | "minutes"
    planned: float
    actual: float
    pct: float | None


class WeeklyZoneSummaryOut(BaseModel):
    week_start: date
    zone: str
    unit: str  # "km" | "minutes"
    planned: float
    actual: float


class TrainingZonesOut(BaseModel):
    pace_zone_minutes: list[ZoneMinutesOut]
    pace_zone_km: list[ZoneKmOut]
    hr_zone_minutes: list[ZoneMinutesOut]
    zone_summary: list[ZoneSummaryOut]
    weekly_zone_summary: list[WeeklyZoneSummaryOut]
    weekly_pace_zone_minutes: list[WeeklyZoneSummaryOut]
    pace_zones_available: bool
    hr_zones_available: bool
