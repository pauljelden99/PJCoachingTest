from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user, require_trainer
from app.models.training_plan import PlannedSession
from app.models.user import User
from app.schemas.training_plan import (
    PlannedSessionCreate,
    PlannedSessionOut,
    PlannedSessionUpdate,
)

router = APIRouter(prefix="/api/training-plans", tags=["training-plans"])


@router.get("/{athlete_id}", response_model=list[PlannedSessionOut])
def list_planned_sessions(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Athlet sieht nur den eigenen Plan (read-only), Trainer jeden."""
    ensure_can_access_athlete(athlete_id, current_user)
    return (
        db.query(PlannedSession)
        .filter(PlannedSession.athlete_id == athlete_id)
        .order_by(PlannedSession.day)
        .all()
    )


@router.post("/", response_model=PlannedSessionOut)
def create_planned_session(
    payload: PlannedSessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    session = PlannedSession(**payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.put("/{session_id}", response_model=PlannedSessionOut)
def update_planned_session(
    session_id: int,
    payload: PlannedSessionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    """Der Trainingsplan ist fuer den Athleten durchgehend read-only -
    Anlegen, Bearbeiten und Loeschen (POST/PUT/DELETE) bleiben
    Trainer-only. Der Athlet protokolliert stattdessen seine tatsaechlich
    absolvierten Einheiten separat ueber /api/activities."""
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Trainingseinheit nicht gefunden")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
def delete_planned_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    session = db.get(PlannedSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Trainingseinheit nicht gefunden")
    db.delete(session)
    db.commit()
