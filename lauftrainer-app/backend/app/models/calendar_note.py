from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalendarNote(Base):
    """Freie Anmerkung zu einem Kalendertag im Jahresplaner. Ein
    gemeinsames Notizfeld pro (athlete_id, day) - sowohl Trainer als auch
    Athlet duerfen schreiben (Zugriff ueber ensure_can_access_athlete wie
    bei den uebrigen athletenbezogenen Routen), letzter Stand gilt.
    `updated_by` haelt fest, wer zuletzt geschrieben hat, fuer die Anzeige
    im Frontend."""

    __tablename__ = "calendar_notes"
    __table_args__ = (UniqueConstraint("athlete_id", "day", name="uq_calendar_notes_athlete_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(Text, default="")

    updated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    athlete: Mapped["User"] = relationship(foreign_keys=[athlete_id])
    updated_by: Mapped["User"] = relationship(foreign_keys=[updated_by_id])
