from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Index, JSON, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DataSource(str, enum.Enum):
    # Historisch: fuer vor der Entfernung des Strava-Imports importierte
    # Aktivitaeten (nur noch lesend relevant, siehe ActivityCard.tsx).
    STRAVA = "strava"
    MANUAL = "manual"


class Activity(Base):
    __tablename__ = "activities"
    # Jede Leseabfrage filtert auf athlete_id und grenzt ueber day ein bzw.
    # sortiert danach (api/activities.py, api/analytics.py,
    # api/training_zones.py) - der zusammengesetzte Index bedient beides in
    # einem Zugriff, siehe alembic/versions/c5d6e7f8a9b0_*.
    __table_args__ = (Index("ix_activities_athlete_day", "athlete_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    source: Mapped[DataSource] = mapped_column(Enum(DataSource))
    # Eindeutige ID der Aktivitaet - bei manueller Eingabe synthetisch
    # aus athlete_id+start_time gebildet (siehe api/activities.py)
    external_id: Mapped[str] = mapped_column(String(255), unique=True)

    day: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime)
    duration_s: Mapped[float] = mapped_column(Float)
    # Nullable, analog zu PlannedSession.target_distance_km: bei
    # Athletik-/Beweglichkeitseinheiten (siehe target_zone) ergibt eine
    # Distanz keinen Sinn - nur duration_s ist dann gesetzt.
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Subjektiv empfundene Anstrengung (0-10, siehe ManualActivityForm.tsx) -
    # reine Notiz, geht NICHT in daily_load ein (siehe
    # services/training_load.py: die Session-RPE-Formel wurde entfernt,
    # die Trainingslast einer manuellen Eingabe ohne HF-Geraet kommt jetzt
    # ausschliesslich ueber Pace-Zonen zustande, services/normalizer.py).
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Optionale Hoehenmeter (Gesamtanstieg) einer Einheit. Bei Laeufen
    # Grundlage der Grade Adjusted Pace nach dem Minetti-Laufkostenmodell
    # (services/training_load.py:grade_adjustment_factor), die in
    # daily_load eingeht (services/normalizer.py); bei anderen Sportarten
    # rein informativ.
    elevation_gain_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Dieselben Planungsfelder wie bei PlannedSession (siehe
    # models/training_plan.py), damit eine protokollierte Einheit im
    # Formular genauso funktioniert wie das Planen einer Einheit
    # (components/PlanSessionFields.tsx wird fuer beide genutzt).
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    target_zone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Siehe models/training_plan.py:PlannedSession.method - dieselbe
    # Methodik-Variante, hier fuer die tatsaechlich protokollierte Einheit.
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    segments: Mapped[list[dict]] = mapped_column(JSON, default=list)

    # Rohdaten fuer die Zonen-Klassifizierung:
    # [{"distance_km": 1.0, "duration_s": 300}, ...]
    splits: Mapped[list[dict]] = mapped_column(JSON, default=list)

    # Ergebnisse der Berechnungs-Engine (app/services/), beim Import
    # bzw. bei manueller Eingabe einmalig berechnet und persistiert:
    daily_load: Mapped[float] = mapped_column(Float, default=0.0)
    zone_km: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    # Aus Distanz/Dauer berechnet (effective_vo2max, siehe
    # services/analytics.py). Nullable: nicht jede Einheit hat eine
    # Distanz (Athletik/Beweglichkeit).
    effective_vo2max: Mapped[float | None] = mapped_column(Float, nullable=True)

    athlete: Mapped["User"] = relationship(back_populates="activities")
