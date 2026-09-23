"""Minimaler Mailversand fuer den "Passwort vergessen"-Link
(app/api/auth.py:forgot_password). Bewusst ohne zusaetzliche Abhaengigkeit
(smtplib aus der Standardbibliothek reicht fuer eine einzelne
Transaktionsmail).

Ohne konfigurierten SMTP_HOST (siehe core/config.py, z.B. lokale
Entwicklung) wird die Mail statt verschickt geloggt - so bleibt der
Passwort-vergessen-Flow auch ohne Mailserver testbar (der Reset-Link
landet dann im Server-Log)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("SMTP nicht konfiguriert - Mail an %s wird nur geloggt:\n%s\n%s", to, subject, body)
        return

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(message)
