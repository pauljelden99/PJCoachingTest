from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DailyWellness(Base):
    """Taegliche Wellness-Werte eines Athleten (Ruhepuls, HRV, Schlafdauer,
    Schlafqualitaet) - bewusst NICHT in Activity integriert (siehe
    models/activity.py), da diese Werte unabhaengig davon erfasst werden,
    ob an dem Tag trainiert wurde (typischerweise morgens vor dem
    Training protokolliert), waehrend Activity eine absolvierte Einheit
    beschreibt. Ein Eintrag pro (athlete_id, day), analog zu CalendarNote."""

    __tablename__ = "daily_wellness"
    __table_args__ = (UniqueConstraint("athlete_id", "day", name="uq_daily_wellness_athlete_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)

    resting_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    hrv: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_duration_h: Mapped[float | None] = mapped_column(Float, nullable=True)
    # 1-10, siehe schemas/daily_wellness.py:DailyWellnessUpsert (Field ge=1, le=10)
    sleep_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    athlete: Mapped["User"] = relationship()
