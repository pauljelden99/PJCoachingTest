from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.activity import DataSource
from app.schemas.training_plan import PlanSegment


class ActivityCreate(BaseModel):
    """Payload fuer die manuelle Trainingseingabe. Bewusst werden nur
    Rohdaten entgegengenommen (Dauer, Distanz, optional HF/Splits/RPE) -
    daily_load und zone_km berechnet der Server ueber dieselbe
    Berechnungs-Engine wie bei importierten Aktivitaeten
    (app/services/normalizer.py), damit beide Wege konsistent bleiben.

    title/description/target_zone/segments sind dieselben Planungsfelder
    wie bei PlannedSessionCreate (siehe schemas/training_plan.py) - eine
    protokollierte Einheit nutzt im Frontend dasselbe Formular
    (components/PlanSessionFields.tsx) wie das Planen einer Einheit."""

    # Nur fuer Trainer relevant, die im Namen eines Athleten erfassen -
    # Athleten erfassen immer fuer sich selbst (siehe api/activities.py)
    athlete_id: int | None = None
    day: date
    start_time: datetime
    duration_s: float
    distance_m: float | None = None
    avg_hr: float | None = None
    elevation_gain_m: float | None = None  # primaer fuer Radeinheiten
    splits: list[dict] | None = None  # [{"distance_km": 1.0, "duration_s": 300}]
    rpe: float | None = None  # 0-10, reine Notiz - geht nicht in daily_load ein
    title: str = ""
    description: str = ""
    target_zone: str | None = None
    # Methodik-Variante der Zielzone, siehe models/training_plan.py:
    # PlannedSession.method - aktuell nur "Fahrtspiel" fuer target_zone="Schwelle".
    method: str | None = None
    segments: list[PlanSegment] = []


class ActivityUpdate(BaseModel):
    """Payload zum Korrigieren einer bereits protokollierten Einheit
    (manuell erfasst oder importiert) - sowohl Trainer als auch der
    betroffene Athlet selbst duerfen bearbeiten (siehe api/activities.py),
    analog zu PlannedSessionUpdate. daily_load/zone_km werden bei einer
    Aenderung ueber dieselbe Engine wie beim Anlegen neu berechnet."""

    day: date | None = None
    start_time: datetime | None = None
    duration_s: float | None = None
    distance_m: float | None = None
    avg_hr: float | None = None
    elevation_gain_m: float | None = None
    rpe: float | None = None
    title: str | None = None
    description: str | None = None
    target_zone: str | None = None
    method: str | None = None
    segments: list[PlanSegment] | None = None


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: DataSource
    day: date
    start_time: datetime
    duration_s: float
    distance_m: float | None
    avg_hr: float | None
    elevation_gain_m: float | None
    rpe: float | None
    daily_load: float
    zone_km: dict[str, float]
    title: str
    description: str
    target_zone: str | None
    method: str | None
    segments: list[PlanSegment]
