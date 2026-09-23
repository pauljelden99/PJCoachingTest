"""
FastAPI-Dependencies fuer die Zugriffskontrolle: aktuellen Nutzer aus dem
JWT-Bearer-Token laden, sowie eine Trainer-only-Guard-Dependency.

Zugriffsregel fuer alle athletenbezogenen Routen (activities, training-load,
training-plans, analytics): der angefragte `athlete_id` muss entweder der
eingeloggte Nutzer selbst sein, oder der eingeloggte Nutzer hat die Rolle
`trainer` (Trainer sehen/bearbeiten alle Athleten, siehe `require_trainer`
und `ensure_can_access_athlete`). Admins sind hier bewusst aussen vor: die
Rolle `admin` dient ausschliesslich der Kontoverwaltung (Trainer-Accounts
anlegen, siehe `require_admin` und `app/api/auth.py:create_trainer`) und hat
keine athletenbezogenen Daten - `ensure_can_access_athlete` verweigert
Admins daher athletenbezogene Routen genauso wie Athleten, die auf fremde
IDs zugreifen wollen.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nicht authentifiziert",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error

    payload = decode_access_token(token)
    if payload is None or payload.get("sub") is None:
        raise credentials_error

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise credentials_error
    return user


def require_trainer(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.TRAINER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nur für Trainer")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    # Trainer duerfen ebenfalls Konten anlegen (siehe app/api/auth.py:
    # create_athlete/create_trainer) - aber nur, wenn ihnen beim Anlegen
    # explizit Admin-Rechte gegeben wurden (User.is_admin, siehe
    # models/user.py). Admin-Rechte sind fuer sie eine Obermenge, nicht
    # umgekehrt (ein Admin wird dadurch nicht zum Trainer, siehe
    # ensure_can_access_athlete oben).
    if user.role == UserRole.ADMIN:
        return user
    if user.role == UserRole.TRAINER and user.is_admin:
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nur für Admins")


def ensure_can_access_athlete(athlete_id: int, user: User) -> None:
    """Wirft 403, falls `user` weder der angefragte Athlet selbst noch
    Trainer ist. Von den athletenbezogenen Routen (activities,
    training-load, training-plans, analytics) vor jedem Datenzugriff
    aufzurufen."""
    if user.role != UserRole.TRAINER and user.id != athlete_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff")
