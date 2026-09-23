from datetime import date

from pydantic import BaseModel, Field


class DailyWellnessUpsert(BaseModel):
    """Payload fuer PUT /api/wellness/{athlete_id}/{day}. Alle Felder
    optional - nur mitgeschickte Werte werden aktualisiert, ein Tag kann
    z.B. nur die Schlafdaten ohne HRV enthalten (kein Messgeraet)."""

    resting_hr: float | None = None
    hrv: float | None = None
    sleep_duration_h: float | None = None
    sleep_quality: int | None = Field(default=None, ge=1, le=10)


class DailyWellnessOut(BaseModel):
    day: date
    resting_hr: float | None
    hrv: float | None
    sleep_duration_h: float | None
    sleep_quality: int | None


class WellnessBaselinePoint(BaseModel):
    """Ein Tag im Zeitverlauf: der geloggte Wert (falls vorhanden) plus die
    aus den vorangegangenen 30 Tagen berechnete Baseline (siehe
    services/wellness.py:compute_baseline_series). baseline_* ist None,
    wenn im 30-Tage-Fenster zu wenige Werte vorliegen, um eine sinnvolle
    Baseline zu bilden."""

    day: date
    value: float | None
    baseline_mean: float | None
    baseline_lower: float | None
    baseline_upper: float | None


class WellnessSeriesOut(BaseModel):
    resting_hr: list[WellnessBaselinePoint]
    hrv: list[WellnessBaselinePoint]
    sleep_duration_h: list[WellnessBaselinePoint]
    sleep_quality: list[WellnessBaselinePoint]
