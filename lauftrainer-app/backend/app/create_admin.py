"""Legt einen Admin-Account direkt in der Datenbank an.

Admin-Accounts haben bewusst keinen API-Registrierungsweg (siehe
app/api/auth.py) - wer einen Admin-Account besitzt, kann Trainer-Accounts
erzeugen, daher muss der erste Admin ausserhalb der App bereitgestellt
werden.

Aufruf (im backend/-Verzeichnis, mit gesetzter DATABASE_URL/.env):

    python -m app.create_admin --name "Max Muster" --email admin@example.com --password "..."
"""

from __future__ import annotations

import argparse

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User, UserRole  # noqa: F401 (registriert alle Mapper-Relationships)


def main() -> None:
    parser = argparse.ArgumentParser(description="Admin-Account anlegen")
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == args.email).first() is not None:
            raise SystemExit(f"E-Mail {args.email} ist bereits registriert")

        user = User(
            name=args.name,
            email=args.email,
            hashed_password=hash_password(args.password),
            role=UserRole.ADMIN,
        )
        db.add(user)
        db.commit()
        print(f"Admin-Account fuer {args.email} angelegt (id={user.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
