from __future__ import annotations

from datetime import date

from sqlalchemy import String, Date, ForeignKey, Index, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlannedSession(Base):
    """Eine geplante Trainingseinheit im Coach-Editor. Der Abgleich
    Plan-vs-Ist passiert im Frontend/einer spaeteren API-Route durch
    Gegenueberstellung von `target_zone` mit den tatsaechlichen
    zone_km-Werten der Activity am selben Tag."""

    __tablename__ = "planned_sessions"
    # Siehe models/activity.py - dieselbe (athlete_id, day)-Zugriffsform.
    __table_args__ = (Index("ix_planned_sessions_athlete_day", "athlete_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    day: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    target_zone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "GA1" | "Schwelle" | "VO2max" | "Sprint/Reps"
    # Methodik-Variante der Zielzone, aktuell nur "Fahrtspiel" fuer
    # target_zone="Schwelle" (freies, wechselndes Lauftempo statt fester
    # Intervall-Segmente, siehe services/training_zones.py:PACE_ZONES-
    # Kommentar) - bewusst ein eigenes Feld statt eines eigenen
    # target_zone-Werts, da eine Fahrtspiel-Schwelleneinheit weiterhin ganz
    # normal als Schwelle in die Zonen-Auswertung (Plan-vs-Ist, km) eingeht.
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_distance_km: Mapped[float | None] = mapped_column(nullable=True)
    # Alternative zu target_distance_km fuer nicht-lauf-spezifische
    # Einheitstypen ("Athletik" | "Beweglichkeit"), bei denen eine
    # Distanzangabe keinen Sinn ergibt - siehe frontend/src/lib/plan.ts:
    # zoneUsesDuration().
    target_duration_s: Mapped[float | None] = mapped_column(nullable=True)
    # Editierbares Ziel-Tempo ("mm:ss"/km) fuer nicht-strukturierte Einheiten
    # (v.a. GA1-Laeufe ohne Segmente) - default leer, das Frontend schlaegt
    # dann die aus den Athletenzonen abgeleitete GA1-Pace vor, siehe
    # frontend/src/components/PlanSessionFields.tsx. Bei strukturierten
    # Schwellen-/VO2max-Einheiten steckt das Tempo stattdessen pro Segment
    # in segments[].pace.
    target_pace: Mapped[str] = mapped_column(String(10), default="")

    # Strukturierter Ablauf fuer Schwellen-/VO2max-Einheiten, z.B.
    # [{"type": "warmup", "repeat": 1, "distance_km": 2.0, "zone": "GA1"},
    #  {"type": "interval", "repeat": 6, "distance_km": 1.0, "pace": "3:45", "zone": "Schwelle"},
    #  {"type": "jog_recovery", "repeat": 6, "distance_km": 0.4}]
    # `type` in warmup|steady|interval|jog_recovery|rest|cooldown.
    # `target_distance_km` wird im Frontend aus den Segment-Distanzen
    # aufsummiert, wenn Segmente vorhanden sind - siehe PlanEditor.tsx.
    segments: Mapped[list[dict]] = mapped_column(JSON, default=list)

    athlete: Mapped["User"] = relationship(back_populates="planned_sessions")
