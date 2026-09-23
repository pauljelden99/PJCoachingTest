from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.activity import Activity
from app.models.user import User
from app.schemas.training_load import PmcPointOut
from app.services.training_load import DailyLoadPoint, compute_pmc, fill_missing_days

router = APIRouter(prefix="/api/training-load", tags=["training-load"])


@router.get("/{athlete_id}", response_model=list[PmcPointOut])
def get_training_load(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liefert die taegliche CTL/ATL/TSB-Zeitreihe fuer den Fitness-
    /Fatigue-/Form-Chart im Dashboard."""
    ensure_can_access_athlete(athlete_id, current_user)
    # Nur die beiden tatsaechlich gebrauchten Spalten statt vollstaendiger
    # ORM-Objekte: die Historie eines Athleten geht ueber Jahre, und jedes
    # Activity-Objekt wuerde sonst auch die JSON-Spalten splits/segments/
    # zone_km mitladen und deserialisieren, die hier niemand anfasst.
    rows = (
        db.query(Activity.day, Activity.daily_load)
        .filter(Activity.athlete_id == athlete_id)
        .order_by(Activity.day)
        .all()
    )

    daily_loads = [DailyLoadPoint(day=day, load=load) for day, load in rows]
    filled = fill_missing_days(daily_loads)
    pmc = compute_pmc(filled)

    return [PmcPointOut(day=p.day, load=p.load, ctl=p.ctl, atl=p.atl, tsb=p.tsb) for p in pmc]
