from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.calendar_note import CalendarNote
from app.models.user import User
from app.schemas.calendar_note import CalendarNoteOut, CalendarNoteUpsert

router = APIRouter(prefix="/api/calendar-notes", tags=["calendar-notes"])


def _to_out(note: CalendarNote) -> CalendarNoteOut:
    return CalendarNoteOut(
        day=note.day,
        note=note.note,
        updated_by_name=note.updated_by.name if note.updated_by else None,
        updated_at=note.updated_at,
    )


@router.get("/{athlete_id}", response_model=list[CalendarNoteOut])
def list_calendar_notes(
    athlete_id: int,
    start: date = Query(...),
    end: date = Query(..., description="Exklusiv"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_can_access_athlete(athlete_id, current_user)
    notes = (
        db.query(CalendarNote)
        .filter(CalendarNote.athlete_id == athlete_id, CalendarNote.day >= start, CalendarNote.day < end)
        .order_by(CalendarNote.day)
        .all()
    )
    return [_to_out(n) for n in notes]


@router.put("/{athlete_id}/{day}", response_model=CalendarNoteOut)
def upsert_calendar_note(
    athlete_id: int,
    day: date,
    payload: CalendarNoteUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sowohl Trainer als auch der Athlet selbst duerfen schreiben (siehe
    CalendarNote-Docstring) - ein leerer Text loescht die Notiz statt eine
    leere Zeile zu behalten."""
    ensure_can_access_athlete(athlete_id, current_user)

    note = db.query(CalendarNote).filter(CalendarNote.athlete_id == athlete_id, CalendarNote.day == day).first()

    if not payload.note.strip():
        if note is not None:
            db.delete(note)
            db.commit()
        return CalendarNoteOut(day=day, note="", updated_by_name=None, updated_at=None)

    if note is None:
        note = CalendarNote(athlete_id=athlete_id, day=day)
        db.add(note)

    note.note = payload.note
    note.updated_by_id = current_user.id
    db.commit()
    db.refresh(note)
    return _to_out(note)
