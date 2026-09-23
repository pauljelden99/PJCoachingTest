from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.models.user import User, UserRole
from app.schemas.user import (
    AccountDeleteIn,
    AthleteCreate,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    TokenOut,
    TrainerCreate,
    UserLogin,
    UserOut,
    UserProfileUpdate,
)
from app.services.email import send_email
from app.services.user_profile import apply_profile_update, delete_athlete_data

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/athletes", response_model=UserOut)
def create_athlete(
    payload: AthleteCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Legt einen Athleten-Account an - nur fuer Admins. Es gibt bewusst
    keine oeffentliche Selbstregistrierung mehr: Athletenkonten entstehen
    ausschliesslich hierueber, analog zu create_trainer()."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-Mail bereits registriert")

    athlete = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.ATHLETE,
    )
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


@router.post("/trainers", response_model=UserOut)
def create_trainer(
    payload: TrainerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Legt einen Trainer-Account an - nur fuer Admins. Es gibt bewusst
    keinen Self-Service-Weg zu einem Trainer-Account (siehe create_athlete())."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-Mail bereits registriert")

    trainer = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.TRAINER,
        is_admin=payload.is_admin,
    )
    db.add(trainer)
    db.commit()
    db.refresh(trainer)
    return trainer


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültige Anmeldedaten")

    token = create_access_token(user_id=user.id, role=user.role.value)
    return TokenOut(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pflegt Name/E-Mail, HF-Ruhe/-Max sowie Wettkampfzeiten des
    eingeloggten Nutzers. Ohne diesen Endpoint koennten weder Stammdaten
    noch die Werte gepflegt werden, die HrZones/PaceZones (siehe
    app/api/training_zones.py, app/api/activities.py) voraussetzen.

    Die eigentliche Update-Logik steckt in services/user_profile.py, damit
    sie auch von PUT /api/trainer/athletes/{id} (Trainer pflegt ein
    fremdes Athletenprofil) genutzt werden kann."""
    return apply_profile_update(db, current_user, payload)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aktuelles Passwort ist falsch")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    payload: AccountDeleteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Loescht das eigene Konto unwiderruflich. Passwort-Bestaetigung als
    Schutz gegen versehentliches/erzwungenes Loeschen ueber ein gekapertes
    Session-Token. Abhaengige Zeilen werden explizit geloescht (siehe
    services/user_profile.py:delete_athlete_data), da die Fremdschluessel
    (athlete_id) keine DB-seitige ON DELETE CASCADE haben."""
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwort ist falsch")

    delete_athlete_data(db, current_user)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: PasswordResetRequestIn, db: Session = Depends(get_db)):
    """Verschickt bei bekannter E-Mail einen zeitlich begrenzten
    Reset-Link (siehe core/security.py:create_password_reset_token). Liefert
    bewusst immer 204, auch wenn die E-Mail nicht existiert - sonst liesse
    sich ueber den Statuscode ausspaehen, welche E-Mails registriert sind."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        token = create_password_reset_token(user.id)
        reset_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"
        send_email(
            to=user.email,
            subject="Lauftrainer - Passwort zurücksetzen",
            body=(
                f"Hallo {user.name},\n\n"
                "für dein Lauftrainer-Konto wurde ein neues Passwort angefordert. "
                f"Über folgenden Link kannst du ein neues Passwort vergeben (gültig für 30 Minuten):\n\n"
                f"{reset_link}\n\n"
                "Falls du das nicht warst, kannst du diese E-Mail ignorieren."
            ),
        )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: PasswordResetConfirmIn, db: Session = Depends(get_db)):
    """Setzt ueber einen per forgot_password verschickten Token ein neues
    Passwort - ohne aktuelles Passwort zu kennen (im Gegensatz zu
    PUT /api/auth/me/password), daher die Signatur+Ablaufzeit-Absicherung
    ueber verify_password_reset_token statt eine Login-Pruefung."""
    user_id = verify_password_reset_token(payload.token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link ist ungültig oder abgelaufen")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link ist ungültig oder abgelaufen")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
