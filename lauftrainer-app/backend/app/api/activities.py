import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.activity import Activity, DataSource
from app.models.user import Gender, User, UserRole
from app.schemas.activity import ActivityCreate, ActivityOut, ActivityUpdate
from app.services.normalizer import NormalizedActivity, build_activity_record
from app.services.training_load import RACE_TIME_FIELDS
from app.services.zone_classifier import PaceZones

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/{athlete_id}", response_model=list[ActivityOut])
def list_activities(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Chronologisch aufsteigend (aeltester Tag zuerst), analog zu
    GET /api/training-plans/{athlete_id} - Plan und Protokoll sollen in
    derselben Reihenfolge angezeigt werden koennen (siehe
    frontend/src/components/ActivityList.tsx/PlanSessionList.tsx)."""
    ensure_can_access_athlete(athlete_id, current_user)
    return (
        db.query(Activity)
        .filter(Activity.athlete_id == athlete_id)
        .order_by(Activity.day)
        .all()
    )


@router.post("/manual", response_model=ActivityOut)
def create_manual_activity(
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manuelle Trainingseingabe - laeuft ueber die zentrale Berechnungs-
    Engine (siehe services/normalizer.py), damit CTL/ATL/TSB konsistent
    aus derselben Logik entstehen.

    Athleten erfassen immer fuer sich selbst (ein evtl. mitgeschicktes
    `athlete_id` im Payload wird ignoriert). Trainer duerfen im Namen eines
    Athleten erfassen und muessen dafuer `athlete_id` explizit angeben.
    """
    if current_user.role == UserRole.TRAINER:
        if payload.athlete_id is None:
            raise HTTPException(status_code=400, detail="athlete_id ist für Trainer erforderlich")
        athlete_id = payload.athlete_id
    else:
        athlete_id = current_user.id

    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")

    pace_zones = None
    if athlete.threshold_pace_sec_per_km and athlete.vo2max_pace_sec_per_km:
        pace_zones = PaceZones(
            threshold_pace_sec_per_km=athlete.threshold_pace_sec_per_km,
            vo2max_pace_sec_per_km=athlete.vo2max_pace_sec_per_km,
            vlt3_pace_sec_per_km=athlete.vlt3_pace_sec_per_km,
        )

    # uuid4-Suffix statt nur athlete_id+start_time: das Frontend setzt fuer
    # jede manuelle Erfassung desselben Tages denselben neutralen Zeitpunkt
    # (Mittag, siehe ManualActivityForm.noonOfDayIso), wodurch eine zweite
    # Einheit desselben Tages sonst denselben external_id erzeugt haette und
    # am Unique-Constraint gescheitert waere ("Eintrag kann nicht
    # gespeichert werden").
    normalized = NormalizedActivity(
        external_id=f"manual-{athlete_id}-{payload.start_time.isoformat()}-{uuid.uuid4().hex[:8]}",
        start_time=payload.start_time,
        duration_s=payload.duration_s,
        distance_m=payload.distance_m,
        avg_hr=payload.avg_hr,
        elevation_gain_m=payload.elevation_gain_m,
        splits=payload.splits or [],
    )

    record = build_activity_record(
        normalized,
        athlete_hr_rest=athlete.hr_rest,
        athlete_hr_max=athlete.hr_max,
        pace_zones=pace_zones,
        manual_rpe=payload.rpe,
        athlete_is_female=athlete.gender == Gender.FEMALE,
        trimp_exponent_factor=athlete.trimp_exponent_factor,
        trimp_weight_factor=athlete.trimp_weight_factor,
        load_k=athlete.load_k,
        cs_use_vlt3=athlete.cs_use_vlt3,
        athlete_race_times_s={f: getattr(athlete, f) for f in RACE_TIME_FIELDS},
        target_zone=payload.target_zone,
        segments=[s.model_dump() for s in payload.segments],
    )

    activity = Activity(
        athlete_id=athlete_id,
        source=DataSource.MANUAL,
        day=payload.day,
        title=payload.title,
        description=payload.description,
        target_zone=payload.target_zone,
        method=payload.method,
        segments=[s.model_dump() for s in payload.segments],
        **record,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.put("/{activity_id}", response_model=ActivityOut)
def update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Korrektur einer protokollierten Einheit. Wie beim Bearbeiten von
    Trainingseinheiten (training_plans.py:update_planned_session) ist das
    auch dem betroffenen Athleten selbst erlaubt, nicht nur dem Trainer -
    Anlegen (POST /manual) bleibt aber wie gehabt Athlet-fuer-sich-selbst
    bzw. Trainer-im-Athletennamen.

    Dauer/Distanz/Puls fliessen ueber dieselbe Engine wie beim Anlegen
    (services/normalizer.py) in eine neu berechnete daily_load/zone_km ein,
    damit CTL/ATL/TSB nach einer Korrektur konsistent bleiben. Vorhandene
    Splits werden dabei unveraendert uebernommen.
    """
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Aktivität nicht gefunden")
    ensure_can_access_athlete(activity.athlete_id, current_user)

    athlete = db.get(User, activity.athlete_id)
    pace_zones = None
    if athlete.threshold_pace_sec_per_km and athlete.vo2max_pace_sec_per_km:
        pace_zones = PaceZones(
            threshold_pace_sec_per_km=athlete.threshold_pace_sec_per_km,
            vo2max_pace_sec_per_km=athlete.vo2max_pace_sec_per_km,
            vlt3_pace_sec_per_km=athlete.vlt3_pace_sec_per_km,
        )

    updates = payload.model_dump(exclude_unset=True)

    normalized = NormalizedActivity(
        external_id=activity.external_id,
        start_time=updates.get("start_time", activity.start_time),
        duration_s=updates.get("duration_s", activity.duration_s),
        distance_m=updates.get("distance_m", activity.distance_m),
        avg_hr=updates.get("avg_hr", activity.avg_hr),
        elevation_gain_m=updates.get("elevation_gain_m", activity.elevation_gain_m),
        splits=activity.splits or [],
    )
    record = build_activity_record(
        normalized,
        athlete_hr_rest=athlete.hr_rest,
        athlete_hr_max=athlete.hr_max,
        pace_zones=pace_zones,
        manual_rpe=updates.get("rpe", activity.rpe),
        athlete_is_female=athlete.gender == Gender.FEMALE,
        trimp_exponent_factor=athlete.trimp_exponent_factor,
        trimp_weight_factor=athlete.trimp_weight_factor,
        load_k=athlete.load_k,
        cs_use_vlt3=athlete.cs_use_vlt3,
        athlete_race_times_s={f: getattr(athlete, f) for f in RACE_TIME_FIELDS},
        target_zone=updates.get("target_zone", activity.target_zone),
        segments=(
            [s.model_dump() for s in payload.segments] if payload.segments is not None else (activity.segments or [])
        ),
    )

    activity.day = updates.get("day", activity.day)
    for field, value in record.items():
        if field == "external_id":
            continue
        setattr(activity, field, value)

    if "title" in updates:
        activity.title = updates["title"]
    if "description" in updates:
        activity.description = updates["description"]
    if "target_zone" in updates:
        activity.target_zone = updates["target_zone"]
    if "method" in updates:
        activity.method = updates["method"]
    if payload.segments is not None:
        activity.segments = [s.model_dump() for s in payload.segments]

    db.commit()
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=204)
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loescht eine protokollierte Einheit unwiderruflich. Wie bei PUT
    (Korrektur) ist das sowohl dem betroffenen Athleten selbst als auch
    dessen Trainer erlaubt (siehe ensure_can_access_athlete) - anders als
    beim Trainingsplan (training_plans.py:delete_planned_session), der
    Trainer-only bleibt, da der Athlet hier seine eigenen protokollierten
    Einheiten verwaltet."""
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Aktivität nicht gefunden")
    ensure_can_access_athlete(activity.athlete_id, current_user)
    db.delete(activity)
    db.commit()
