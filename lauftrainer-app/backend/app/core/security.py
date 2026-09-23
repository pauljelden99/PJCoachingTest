"""
Passwort-Hashing (bcrypt via passlib) und JWT-Erstellung/-Pruefung fuer
das Login-System. Bewusst als reine, DB-freie Funktionen gehalten -
`app/core/deps.py` verbindet sie mit der Datenbank (User-Lookup).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 14  # 14 Tage

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Gibt das dekodierte Payload-Dict zurueck, oder None bei ungueltigem/
    abgelaufenem Token (statt eine Exception durchzureichen) - der Aufrufer
    (app/core/deps.py) entscheidet, wie darauf reagiert wird (i.d.R. 401)."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


OAUTH_STATE_EXPIRE_MINUTES = 15


def create_oauth_state(athlete_id: int) -> str:
    """Signiertes `state` fuer den OAuth-Authorize/Callback-Roundtrip
    (app/api/oauth.py). Ohne Signatur koennte jeder eine beliebige
    athlete_id als `state` an /callback schicken und sich so einen
    fremden Wearable-Token unterschieben."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_EXPIRE_MINUTES)
    payload = {"athlete_id": athlete_id, "exp": expire, "purpose": "oauth_state"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_oauth_state(state: str) -> int | None:
    """Prueft ein von `create_oauth_state` erzeugtes `state` und liefert die
    enthaltene athlete_id, oder None bei ungueltiger/abgelaufener/gefaelschter
    Signatur."""
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "oauth_state":
        return None
    athlete_id = payload.get("athlete_id")
    return int(athlete_id) if athlete_id is not None else None


PASSWORD_RESET_EXPIRE_MINUTES = 30


def create_password_reset_token(user_id: int) -> str:
    """Signiertes, kurzlebiges Token fuer den "Passwort vergessen"-Link
    (app/api/auth.py:forgot_password/reset_password). Analog zu
    create_oauth_state oben - stateless, keine zusaetzliche DB-Tabelle
    noetig, da die Signatur+Ablaufzeit bereits Faelschung/Wiederverwendung
    nach Ablauf verhindern."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    payload = {"user_id": user_id, "exp": expire, "purpose": "password_reset"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_password_reset_token(token: str) -> int | None:
    """Prueft ein von `create_password_reset_token` erzeugtes Token und
    liefert die enthaltene user_id, oder None bei ungueltigem/abgelaufenem/
    gefaelschtem Token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "password_reset":
        return None
    user_id = payload.get("user_id")
    return int(user_id) if user_id is not None else None
