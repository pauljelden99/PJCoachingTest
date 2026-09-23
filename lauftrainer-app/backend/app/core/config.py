from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://lauftrainer:lauftrainer@localhost:5432/lauftrainer"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "change-me"
    # Alleinige Basis fuer generierte Links (Passwort-Reset-Mail, siehe
    # api/auth.py) - bleibt deshalb ein einzelner Wert statt Teil der
    # CORS-Liste unten.
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    # Zusaetzliche, durch Komma getrennte Origins, die CORS-seitig ebenfalls
    # erlaubt werden - z.B. ein probeweise auf GitHub Pages veroeffentlichtes
    # Frontend (siehe README.md, Abschnitt "Testbetrieb auf GitHub Pages")
    # zusaetzlich zum eigentlichen FRONTEND_ORIGIN. Leer = nur FRONTEND_ORIGIN
    # erlaubt (bisheriges Verhalten).
    CORS_EXTRA_ORIGINS: str = ""

    @property
    def cors_allow_origins(self) -> list[str]:
        extra = [origin.strip() for origin in self.CORS_EXTRA_ORIGINS.split(",") if origin.strip()]
        return [self.FRONTEND_ORIGIN, *extra]

    # SMTP fuer den "Passwort vergessen"-Mailversand (app/services/email.py).
    # Bleibt SMTP_HOST leer (z.B. lokale Entwicklung ohne Mailserver), wird
    # die Mail stattdessen geloggt statt verschickt - siehe send_email().
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@lauftrainer.app"
    SMTP_USE_TLS: bool = True


settings = Settings()
