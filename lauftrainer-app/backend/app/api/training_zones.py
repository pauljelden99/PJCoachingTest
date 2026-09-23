from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.activity import Activity
from app.models.training_plan import PlannedSession
from app.models.user import User
from app.schemas.training_zones import TrainingZonesOut, WeeklyZoneSummaryOut, ZoneKmOut, ZoneMinutesOut, ZoneSummaryOut
from app.services.hr_zones import HrZones
from app.services.training_zones import (
    ActivityZoneInput,
    PlannedSessionInput,
    compute_weekly_pace_zone_minutes,
    compute_weekly_zone_summary,
    compute_zone_summary,
    hr_zone_minutes,
    pace_zone_km,
    pace_zone_minutes,
)
from app.services.zone_classifier import PaceZones

router = APIRouter(prefix="/api/training-zones", tags=["training-zones"])


@router.get("/{athlete_id}", response_model=TrainingZonesOut)
def get_training_zones(
    athlete_id: int,
    days: int = Query(28, ge=1, le=365, description="Betrachtungszeitraum in Tagen"),
    start: date | None = Query(None, description="Ueberschreibt `days` mit einem festen [start, end)-Fenster"),
    end: date | None = Query(None, description="Exklusiv, nur zusammen mit `start` wirksam"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Zeit-in-Tempozone, Zeit-in-HF-Zone und Plan-vs-Ist-Abgleich fuer den
    gewaehlten Zeitraum. Default: letzte `days` Tage (nach oben offen, fuer
    das Dashboard). Wenn `start`/`end` gesetzt sind (Wochen-/Monats-
    navigation im Trainingsplan, siehe frontend/src/app/training-plan),
    wird stattdessen ein exaktes [start, end)-Fenster verwendet, das auch
    zukuenftige oder vergangene Wochen/Monate abgrenzen kann."""
    ensure_can_access_athlete(athlete_id, current_user)

    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")

    range_start = start if start is not None else date.today() - timedelta(days=days)
    range_end = end if start is not None else None
    # Fuer die Wochen-Bucketing in compute_weekly_zone_summary wird immer ein
    # festes Ende gebraucht (anders als die uebrigen, nach oben offenen
    # Abfragen unten) - ohne explizites `end` ist das schlicht heute.
    effective_range_end = range_end if range_end is not None else date.today() + timedelta(days=1)

    # Nur die von ActivityZoneInput gebrauchten Spalten (siehe analytics.py).
    activity_query = db.query(
        Activity.day,
        Activity.distance_m,
        Activity.duration_s,
        Activity.avg_hr,
        Activity.zone_km,
        Activity.target_zone,
    ).filter(Activity.athlete_id == athlete_id, Activity.day >= range_start)
    if range_end is not None:
        activity_query = activity_query.filter(Activity.day < range_end)
    activities = activity_query.order_by(Activity.day).all()
    zone_inputs = [
        ActivityZoneInput(
            day=a.day,
            distance_m=a.distance_m,
            duration_s=a.duration_s,
            avg_hr=a.avg_hr,
            zone_km=a.zone_km or {},
            target_zone=a.target_zone,
        )
        for a in activities
    ]

    pace_zones = None
    if athlete.threshold_pace_sec_per_km and athlete.vo2max_pace_sec_per_km:
        pace_zones = PaceZones(
            threshold_pace_sec_per_km=athlete.threshold_pace_sec_per_km,
            vo2max_pace_sec_per_km=athlete.vo2max_pace_sec_per_km,
        )
    hr_zones = None
    if athlete.hr_rest and athlete.hr_max:
        hr_zones = HrZones(hr_rest=athlete.hr_rest, hr_max=athlete.hr_max)

    planned_query = db.query(
        PlannedSession.day,
        PlannedSession.title,
        PlannedSession.target_zone,
        PlannedSession.target_distance_km,
        PlannedSession.target_duration_s,
        PlannedSession.segments,
    ).filter(PlannedSession.athlete_id == athlete_id, PlannedSession.day >= range_start)
    if range_end is not None:
        planned_query = planned_query.filter(PlannedSession.day < range_end)
    planned_sessions = planned_query.order_by(PlannedSession.day).all()
    plan_inputs = [
        PlannedSessionInput(
            day=p.day,
            title=p.title,
            target_zone=p.target_zone,
            target_distance_km=p.target_distance_km,
            target_duration_s=p.target_duration_s,
            segments=p.segments,
        )
        for p in planned_sessions
    ]

    return TrainingZonesOut(
        pace_zone_minutes=[
            ZoneMinutesOut(zone=zone, minutes=minutes)
            for zone, minutes in pace_zone_minutes(zone_inputs, pace_zones).items()
        ],
        pace_zone_km=[
            ZoneKmOut(zone=zone, km=km) for zone, km in pace_zone_km(zone_inputs, pace_zones).items()
        ],
        hr_zone_minutes=[
            ZoneMinutesOut(zone=zone, minutes=minutes)
            for zone, minutes in hr_zone_minutes(zone_inputs, hr_zones).items()
        ],
        zone_summary=[
            ZoneSummaryOut(**vars(point)) for point in compute_zone_summary(plan_inputs, zone_inputs, pace_zones)
        ],
        weekly_zone_summary=[
            WeeklyZoneSummaryOut(**vars(point))
            for point in compute_weekly_zone_summary(
                plan_inputs, zone_inputs, pace_zones, range_start, effective_range_end
            )
        ],
        weekly_pace_zone_minutes=[
            WeeklyZoneSummaryOut(**vars(point))
            for point in compute_weekly_pace_zone_minutes(zone_inputs, pace_zones, range_start, effective_range_end)
        ],
        pace_zones_available=pace_zones is not None,
        hr_zones_available=hr_zones is not None,
    )
