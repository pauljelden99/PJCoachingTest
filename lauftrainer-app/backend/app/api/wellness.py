from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.daily_wellness import DailyWellness
from app.models.user import User
from app.schemas.daily_wellness import DailyWellnessOut, DailyWellnessUpsert, WellnessSeriesOut
from app.services.wellness import BASELINE_WINDOW_DAYS, WellnessEntryInput, compute_baseline_series

router = APIRouter(prefix="/api/wellness", tags=["wellness"])

METRICS = ("resting_hr", "hrv", "sleep_duration_h", "sleep_quality")


def _to_out(entry: DailyWellness) -> DailyWellnessOut:
    return DailyWellnessOut(
        day=entry.day,
        resting_hr=entry.resting_hr,
        hrv=entry.hrv,
        sleep_duration_h=entry.sleep_duration_h,
        sleep_quality=entry.sleep_quality,
    )


@router.get("/{athlete_id}", response_model=list[DailyWellnessOut])
def list_wellness(
    athlete_id: int,
    start: date = Query(...),
    end: date = Query(..., description="Exklusiv"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_can_access_athlete(athlete_id, current_user)
    entries = (
        db.query(DailyWellness)
        .filter(DailyWellness.athlete_id == athlete_id, DailyWellness.day >= start, DailyWellness.day < end)
        .order_by(DailyWellness.day)
        .all()
    )
    return [_to_out(e) for e in entries]


@router.put("/{athlete_id}/{day}", response_model=DailyWellnessOut)
def upsert_wellness(
    athlete_id: int,
    day: date,
    payload: DailyWellnessUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_can_access_athlete(athlete_id, current_user)

    entry = db.query(DailyWellness).filter(DailyWellness.athlete_id == athlete_id, DailyWellness.day == day).first()
    if entry is None:
        entry = DailyWellness(athlete_id=athlete_id, day=day)
        db.add(entry)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.get("/{athlete_id}/series", response_model=WellnessSeriesOut)
def get_wellness_series(
    athlete_id: int,
    days: int = Query(28, ge=1, le=365, description="Betrachtungszeitraum in Tagen"),
    start: date | None = Query(None, description="Ueberschreibt `days` mit einem festen [start, end)-Fenster"),
    end: date | None = Query(None, description="Exklusiv, nur zusammen mit `start` wirksam"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Wie training_zones.get_training_zones: Standardmaessig die letzten
    `days` Tage, oder ein festes [start, end)-Fenster fuer die Dashboard-
    Monats-/Jahresauswahl. Laedt zusaetzlich BASELINE_WINDOW_DAYS Tage vor
    range_start, damit die Baseline auch am Anfang des Fensters auf
    vollstaendiger Historie basiert statt kuenstlich duenn zu sein."""
    ensure_can_access_athlete(athlete_id, current_user)

    if start is not None:
        range_start = start
        range_end = end if end is not None else date.today() + timedelta(days=1)
    else:
        range_start = date.today() - timedelta(days=days)
        range_end = date.today() + timedelta(days=1)
    fetch_start = range_start - timedelta(days=BASELINE_WINDOW_DAYS - 1)

    entries = (
        db.query(DailyWellness)
        .filter(DailyWellness.athlete_id == athlete_id, DailyWellness.day >= fetch_start, DailyWellness.day < range_end)
        .order_by(DailyWellness.day)
        .all()
    )

    series = {}
    for metric in METRICS:
        metric_entries = [WellnessEntryInput(day=e.day, value=getattr(e, metric)) for e in entries]
        series[metric] = compute_baseline_series(metric_entries, range_start, range_end)

    return WellnessSeriesOut(**series)
