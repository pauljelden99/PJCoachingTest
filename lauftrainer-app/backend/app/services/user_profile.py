"""
Gemeinsame Update-Logik fuer Nutzerprofile - genutzt sowohl von
PUT /api/auth/me (Athlet/Trainer pflegt das eigene Profil) als auch von
PUT /api/trainer/athletes/{id} (Trainer pflegt ein fremdes Athletenprofil),
damit Email-Uniqueness-Check, zones_last_updated-Bump und die Ableitung
von threshold_pace_sec_per_km/vo2max_pace_sec_per_km nicht doppelt
gepflegt werden muessen.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.calendar_note import CalendarNote
from app.models.daily_wellness import DailyWellness
from app.models.training_plan import PlannedSession
from app.models.user import User
from app.schemas.user import ZONE_FIELDS, UserProfileUpdate


# Aufwaerm-/Cooldown-Vorgaben sowie die Formeln zur Trainingslastberechnung
# (TRIMP/Pace-Kostenfunktion, siehe frontend/src/components/
# LoadFormulaSettings.tsx) sind reine Trainer-Einstellungen - ohne diese
# serverseitige Sperre koennte ein Athlet sie trotz ausgeblendeter UI
# weiterhin per direktem PUT /api/auth/me-Request selbst setzen (und damit
# z.B. die eigene Trainingslast schoenrechnen).
TRAINER_ONLY_FIELDS = {
    "warmup_pace_sec_per_km",
    "cooldown_pace_sec_per_km",
    "warmup_watts",
    "cooldown_watts",
    "trimp_exponent_factor",
    "trimp_weight_factor",
    "load_k",
    "cs_use_vlt3",
}


def apply_profile_update(
    db: Session, user: User, payload: UserProfileUpdate, acting_as_trainer: bool = False
) -> User:
    updates = payload.model_dump(exclude_unset=True)
    if not acting_as_trainer:
        for field in TRAINER_ONLY_FIELDS:
            updates.pop(field, None)

    if "email" in updates and updates["email"] != user.email:
        existing = db.query(User).filter(User.email == updates["email"]).first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-Mail bereits registriert")

    for field, value in updates.items():
        setattr(user, field, value)
    if ZONE_FIELDS & updates.keys():
        user.zones_last_updated = date.today()

    # Schwellen-/VO2max-Pace (services/zone_classifier.py) werden aus den
    # Wettkampfzeiten abgeleitet: 10km-Pace+5s/km als Schwellenpace-
    # Naeherung, 5km-Pace als VO2max-Pace (deckt sich mit den Bakken-
    # Zonengrenzen im Frontend, siehe frontend/src/lib/bakkenZones.ts).
    # Immer neu berechnet (nicht nur bei geaendertem Feld), damit beide
    # Werte nie auseinanderlaufen - es sei denn, der Trainer hat
    # pace_zones_manual aktiviert und setzt die beiden Werte direkt (siehe
    # UserProfileUpdate-Docstring); dann bleiben vom Client mitgeschickte
    # Werte (bereits oben per setattr gesetzt) unangetastet.
    if not user.pace_zones_manual:
        user.vo2max_pace_sec_per_km = user.race_5k_time_s / 5 if user.race_5k_time_s else None
        user.threshold_pace_sec_per_km = user.race_10k_time_s / 10 + 5 if user.race_10k_time_s else None

    db.commit()
    db.refresh(user)
    return user


def delete_athlete_data(db: Session, athlete: User) -> None:
    """Loescht einen Athleten samt aller abhaengigen Zeilen unwiderruflich -
    gemeinsam genutzt von DELETE /api/auth/me (Athlet loescht sich selbst)
    und DELETE /api/trainer/athletes/{id} (Trainer loescht einen Athleten,
    z.B. einen Test-/QA-Account), damit beide Wege dieselben Tabellen
    abraeumen. Die Fremdschluessel (athlete_id) haben keine DB-seitige
    ON DELETE CASCADE, daher explizit vor dem User selbst."""
    db.query(Activity).filter(Activity.athlete_id == athlete.id).delete()
    db.query(PlannedSession).filter(PlannedSession.athlete_id == athlete.id).delete()
    db.query(CalendarNote).filter(CalendarNote.athlete_id == athlete.id).delete()
    db.query(DailyWellness).filter(DailyWellness.athlete_id == athlete.id).delete()
    db.delete(athlete)
    db.commit()
