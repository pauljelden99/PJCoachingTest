from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_trainer
from app.models.activity import Activity
from app.models.training_plan import PlannedSession
from app.models.user import User, UserRole
from app.schemas.training_plan import PlannedSessionOut
from app.schemas.user import AthleteProfileOut, UserOut, UserProfileUpdate
from app.services.training_load import (
    RACE_TIME_FIELDS,
    DailyLoadPoint,
    critical_speed_model,
    latest_pmc,
    riegel_exponent,
)
from app.services.user_profile import apply_profile_update, delete_athlete_data

router = APIRouter(prefix="/api/trainer", tags=["trainer"])


class AthleteSummaryOut(BaseModel):
    id: int
    name: str
    email: str
    last_activity_day: str | None
    ctl: float
    atl: float
    tsb: float
    # Fuer die Tempo-Ableitung bei Segmenten im Trainingsplan-Editor
    # (SegmentEditor.tsx), ohne dafuer einen zusaetzlichen Request zu
    # brauchen - die Athletenliste ist dort ohnehin schon geladen.
    # Die Wettkampfzeiten werden dort fuer die GA1-Pace-Ableitung ueber die
    # Jack-Daniels-Zonentabelle (lib/danielsZones.ts) gebraucht, threshold/
    # vo2max direkt fuer Schwelle/VO2max (siehe lib/paceZones.ts:deriveZonePace).
    threshold_pace_sec_per_km: float | None
    vo2max_pace_sec_per_km: float | None
    # Fuer die Watt-Ableitung bei Rad-Segmenten im Trainingsplan-Editor
    # (SegmentEditor.tsx), analog zu den beiden Pace-Feldern oben.
    ftp_watts: float | None
    # Trainer-Vorgaben fuer Auf-/Abwaermen (Athletenprofil), die die
    # generische Schaetzung in deriveZonePace/deriveZoneWatts uebersteuern.
    warmup_pace_sec_per_km: float | None
    cooldown_pace_sec_per_km: float | None
    warmup_watts: float | None
    cooldown_watts: float | None
    race_5k_time_s: float | None
    race_10k_time_s: float | None
    race_hm_time_s: float | None
    race_marathon_time_s: float | None


@router.get("/athletes", response_model=list[AthleteSummaryOut])
def list_athletes(db: Session = Depends(get_db), _: User = Depends(require_trainer)):
    """Uebersicht aller Athleten fuers Trainer-Dashboard, inkl. aktueller
    Fitness/Fatigue/Form-Kennzahlen (dieselbe Berechnung wie
    api/training_load.py, hier pro Athlet zusammengefasst)."""
    athletes = db.query(User).filter(User.role == UserRole.ATHLETE).order_by(User.name).all()

    # EIN aggregierter Query fuer alle Athleten statt eines pro Athlet
    # (vorher N+1, bei dem ausserdem jede Aktivitaet als vollstaendiges
    # ORM-Objekt inkl. der JSON-Spalten splits/segments geladen wurde,
    # obwohl nur Tag und Trainingslast gebraucht werden). Die Summierung je
    # (Athlet, Tag) uebernimmt die DB - genau das, was fill_missing_days
    # sonst in Python nachholen muesste.
    loads_by_athlete: dict[int, list[DailyLoadPoint]] = defaultdict(list)
    if athletes:
        rows = (
            db.query(Activity.athlete_id, Activity.day, func.sum(Activity.daily_load))
            .filter(Activity.athlete_id.in_([a.id for a in athletes]))
            .group_by(Activity.athlete_id, Activity.day)
            .order_by(Activity.athlete_id, Activity.day)
            .all()
        )
        for athlete_id, day, load in rows:
            loads_by_athlete[athlete_id].append(DailyLoadPoint(day=day, load=load or 0.0))

    summaries: list[AthleteSummaryOut] = []
    for athlete in athletes:
        daily_loads = loads_by_athlete.get(athlete.id, [])
        # Nur der aktuelle Stand wird angezeigt, nicht der Verlauf - daher
        # latest_pmc statt compute_pmc(fill_missing_days(...)), das die
        # komplette Tagesreihe der Historie aufbauen wuerde.
        latest = latest_pmc(daily_loads)

        summaries.append(
            AthleteSummaryOut(
                id=athlete.id,
                name=athlete.name,
                email=athlete.email,
                last_activity_day=str(daily_loads[-1].day) if daily_loads else None,
                ctl=latest.ctl if latest else 0.0,
                atl=latest.atl if latest else 0.0,
                tsb=latest.tsb if latest else 0.0,
                threshold_pace_sec_per_km=athlete.threshold_pace_sec_per_km,
                vo2max_pace_sec_per_km=athlete.vo2max_pace_sec_per_km,
                ftp_watts=athlete.ftp_watts,
                warmup_pace_sec_per_km=athlete.warmup_pace_sec_per_km,
                cooldown_pace_sec_per_km=athlete.cooldown_pace_sec_per_km,
                warmup_watts=athlete.warmup_watts,
                cooldown_watts=athlete.cooldown_watts,
                race_5k_time_s=athlete.race_5k_time_s,
                race_10k_time_s=athlete.race_10k_time_s,
                race_hm_time_s=athlete.race_hm_time_s,
                race_marathon_time_s=athlete.race_marathon_time_s,
            )
        )
    return summaries


class AthletePlanOverviewOut(BaseModel):
    athlete_id: int
    athlete_name: str
    sessions: list[PlannedSessionOut]


@router.get("/plans-overview", response_model=list[AthletePlanOverviewOut])
def get_plans_overview(
    start: date = Query(..., description="Beginn des Zeitraums (inklusiv)"),
    end: date = Query(..., description="Ende des Zeitraums (exklusiv)"),
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    """Trainingsplaene aller Athleten nebeneinander fuer einen Zeitraum -
    Grundlage fuer die "Uebersicht"-Ansicht des Trainers
    (frontend/src/app/overview/page.tsx), in der sonst pro Athlet einzeln
    zwischen den Ansichten gewechselt werden muesste."""
    athletes = db.query(User).filter(User.role == UserRole.ATHLETE).order_by(User.name).all()
    sessions = (
        db.query(PlannedSession)
        .filter(PlannedSession.day >= start, PlannedSession.day < end)
        .order_by(PlannedSession.day)
        .all()
    )
    sessions_by_athlete: dict[int, list[PlannedSession]] = {}
    for s in sessions:
        sessions_by_athlete.setdefault(s.athlete_id, []).append(s)

    return [
        AthletePlanOverviewOut(
            athlete_id=athlete.id,
            athlete_name=athlete.name,
            sessions=sessions_by_athlete.get(athlete.id, []),
        )
        for athlete in athletes
    ]


def _athlete_profile_out(athlete: User) -> AthleteProfileOut:
    """Baut die Trainer-Sicht auf ein Athletenprofil (UserOut + berechnete
    Critical Speed/D'/Riegel-Koeffizient b, siehe schemas/user.py:
    AthleteProfileOut) - alle drei sind reine Ableitungen aus den
    Bestzeiten (services/training_load.py:critical_speed_model/
    riegel_exponent), keine ORM-Attribute, daher hier explizit
    dazugerechnet statt per `from_attributes` aus dem User-Objekt gelesen."""
    race_times_s = {field: getattr(athlete, field) for field in RACE_TIME_FIELDS}
    fit = critical_speed_model(race_times_s)
    cs_mps, d_prime_m = fit if fit else (None, None)
    return AthleteProfileOut(
        **UserOut.model_validate(athlete).model_dump(),
        critical_speed_mps=cs_mps,
        d_prime_m=d_prime_m,
        riegel_b=riegel_exponent(race_times_s),
    )


@router.get("/athletes/{athlete_id}", response_model=AthleteProfileOut)
def get_athlete(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    """Vollstaendiges Athletenprofil fuer die Trainer-Ansicht (Klick auf
    den Athletennamen, siehe frontend/src/app/athletes/page.tsx) -
    read-only, es gibt keinen PUT-Pendant fuer fremde Profile. Enthaelt
    zusaetzlich Critical Speed/D' (siehe AthleteProfileOut) - NUR hier,
    nicht in der Selbstansicht des Athleten (GET /api/auth/me), da der
    Athlet diese Werte laut Vorgabe nicht einsehen koennen soll."""
    athlete = db.query(User).filter(User.id == athlete_id, User.role == UserRole.ATHLETE).first()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")
    return _athlete_profile_out(athlete)


@router.put("/athletes/{athlete_id}", response_model=AthleteProfileOut)
def update_athlete(
    athlete_id: int,
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    """Pflegt das Profil eines Athleten im Namen des Trainers (Athletenprofile-
    Tab, siehe frontend/src/app/athletes/page.tsx) - nutzt dieselbe
    Update-Logik wie PUT /api/auth/me (services/user_profile.py)."""
    athlete = db.query(User).filter(User.id == athlete_id, User.role == UserRole.ATHLETE).first()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")
    updated = apply_profile_update(db, athlete, payload, acting_as_trainer=True)
    return _athlete_profile_out(updated)


@router.delete("/athletes/{athlete_id}", status_code=204)
def delete_athlete(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_trainer),
):
    """Loescht einen Athleten samt aller Aktivitaeten/Trainingsplaene
    unwiderruflich (z.B. einen Test-/QA-Account) - siehe
    services/user_profile.py:delete_athlete_data, dieselbe Loeschlogik
    wie beim Selbst-Loeschen ueber DELETE /api/auth/me."""
    athlete = db.query(User).filter(User.id == athlete_id, User.role == UserRole.ATHLETE).first()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")
    delete_athlete_data(db, athlete)
