from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

SegmentType = Literal["warmup", "steady", "interval", "jog_recovery", "rest", "cooldown"]


class PlanSegment(BaseModel):
    type: SegmentType
    repeat: int = 1
    distance_km: float | None = None
    # Alternative zu distance_km fuer zeitbasierte Intervalle (z.B. "4min
    # Schwelle" statt "1km Schwelle") - im Frontend gegenseitig exklusiv,
    # siehe components/SegmentEditor.tsx.
    duration_s: float | None = None
    pace: str = ""  # "mm:ss" pro km, frei eingegeben, z.B. "4:30" - Laufeinheiten
    # Watt-Zielwert fuer Radeinheiten (services/watt_zones.py) - Alternative
    # zu pace, da Rad-Segmente ueber Leistung statt Tempo gesteuert werden.
    watts: float | None = None
    zone: str | None = None  # "GA1" | "Schwelle" | "VO2max"
    note: str = ""


class PlannedSessionCreate(BaseModel):
    athlete_id: int
    day: date
    title: str
    description: str = ""
    target_zone: str | None = None  # "GA1" | "Schwelle" | "VO2max" | "Sprint/Reps"
    # Methodik-Variante der Zielzone, siehe models/training_plan.py:
    # PlannedSession.method - aktuell nur "Fahrtspiel" fuer target_zone="Schwelle".
    method: str | None = None
    target_distance_km: float | None = None
    # Fuer "Athletik" | "Beweglichkeit" statt target_distance_km, siehe
    # models/training_plan.py.
    target_duration_s: float | None = None
    # "mm:ss"/km, v.a. fuer GA1-Laeufe ohne Segmente - siehe models/training_plan.py.
    target_pace: str = ""
    segments: list[PlanSegment] = []


class PlannedSessionUpdate(BaseModel):
    day: date | None = None
    title: str | None = None
    description: str | None = None
    target_zone: str | None = None
    method: str | None = None
    target_distance_km: float | None = None
    target_duration_s: float | None = None
    target_pace: str | None = None
    segments: list[PlanSegment] | None = None


class PlannedSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    athlete_id: int
    day: date
    title: str
    description: str
    target_zone: str | None
    method: str | None
    target_distance_km: float | None
    target_duration_s: float | None
    target_pace: str
    segments: list[PlanSegment]
