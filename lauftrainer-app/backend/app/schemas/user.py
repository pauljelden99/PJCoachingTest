from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import Gender, UserRole


class TrainerCreate(BaseModel):
    """Payload, mit dem ein Admin einen Trainer-Account anlegt
    (POST /api/auth/trainers, admin-only)."""

    name: str
    email: EmailStr
    password: str
    # Ob der neue Trainer selbst Admin-Rechte bekommt (weitere Trainer-/
    # Athletenkonten anlegen darf, siehe core/deps.py:require_admin) oder
    # nicht. Default False, damit ein Trainer nicht automatisch die
    # Kontoverwaltung fuer alle anderen bekommt.
    is_admin: bool = False


class AthleteCreate(BaseModel):
    """Payload, mit dem ein Admin einen Athleten-Account anlegt
    (POST /api/auth/athletes, admin-only). Es gibt bewusst keine
    Selbstregistrierung mehr - Athletenkonten entstehen ausschliesslich so,
    analog zu TrainerCreate."""

    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_admin: bool
    hr_rest: float | None
    hr_max: float | None
    trimp_exponent_factor: float | None
    trimp_weight_factor: float | None
    load_k: float | None
    cs_use_vlt3: bool
    pace_zones_manual: bool
    threshold_pace_sec_per_km: float | None
    vo2max_pace_sec_per_km: float | None
    easy_pace_sec_per_km: float | None
    marathon_pace_sec_per_km: float | None
    repetition_pace_sec_per_km: float | None
    easy_pace_min_sec_per_km: float | None
    easy_pace_max_sec_per_km: float | None
    marathon_pace_min_sec_per_km: float | None
    marathon_pace_max_sec_per_km: float | None
    threshold_pace_min_sec_per_km: float | None
    threshold_pace_max_sec_per_km: float | None
    vo2max_pace_min_sec_per_km: float | None
    vo2max_pace_max_sec_per_km: float | None
    repetition_pace_min_sec_per_km: float | None
    repetition_pace_max_sec_per_km: float | None
    vlt3_pace_sec_per_km: float | None
    vla_max: float | None
    vo2max_measured: float | None
    ftp_watts: float | None
    warmup_pace_sec_per_km: float | None
    cooldown_pace_sec_per_km: float | None
    warmup_watts: float | None
    cooldown_watts: float | None
    race_100m_time_s: float | None
    race_400m_time_s: float | None
    race_800m_time_s: float | None
    race_1500m_time_s: float | None
    race_5k_time_s: float | None
    race_10k_time_s: float | None
    race_hm_time_s: float | None
    race_marathon_time_s: float | None
    zones_last_updated: date | None
    birth_date: date | None
    gender: Gender | None
    height_cm: float | None
    weight_kg: float | None
    weekly_rhythm_note: str | None
    goal_race_name: str | None
    goal_race_date: date | None
    goal_time_s: float | None
    goals_note: str | None
    notes: str | None
    avatar: str | None
    created_at: datetime


class AthleteProfileOut(UserOut):
    """UserOut plus aus den Bestzeiten berechnete physiologische Kennwerte -
    NUR fuer die Trainer-Sicht auf ein Athletenprofil (GET/PUT
    /api/trainer/athletes/{id}), NICHT fuer die Selbstansicht eines
    Athleten (GET/PUT /api/auth/me nutzt weiterhin das einfache UserOut).
    Der Athlet soll diese Werte laut Vorgabe nicht einsehen koennen - sie
    werden serverseitig (api/trainer.py) berechnet und sind niemals in
    UserOut enthalten:

    - critical_speed_mps/d_prime_m: Critical Speed und anaerobe Kapazitaet
      aus dem Critical-Speed-2-Parameter-Modell (services/training_load.py:
      critical_speed_model, nur Bestzeiten 800m-5000m). None mangels
      mindestens zwei passender Bestzeiten.
    - riegel_b: Riegel-Koeffizient aus dem Ermuedungs-Fit (services/
      training_load.py:riegel_exponent, nur Bestzeiten 3000m-Marathon,
      bestimmt indirekt K - siehe k_from_riegel_exponent). None mangels
      mindestens zwei passender Bestzeiten.
    """

    critical_speed_mps: float | None
    d_prime_m: float | None
    riegel_b: float | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserProfileUpdate(BaseModel):
    """Pflegt Stammdaten (Name/E-Mail), Ruhe-/Maximalpuls, die optionalen
    TRIMP-Formel-Ueberschreibungen (trimp_exponent_factor/
    trimp_weight_factor - siehe services/training_load.py:
    load_from_hr_trimp), Laktat-Leistungsdiagnostik-Werte (vLT3-Pace,
    VLaMax) sowie Wettkampfzeiten.
    `threshold_pace_sec_per_km`/`vo2max_pace_sec_per_km` werden standardmaessig
    (pace_zones_manual=False) weiterhin serverseitig aus
    race_10k_time_s/race_5k_time_s abgeleitet (siehe
    services/user_profile.py:apply_profile_update), damit die bestehende
    Pace-Zonen-Klassifizierung (services/zone_classifier.py) automatisch
    synchron bleibt, statt manuell geschaetzt werden zu muessen. Nur wenn
    pace_zones_manual=True gesetzt ist, werden hier mitgeschickte Werte fuer
    diese beiden Felder uebernommen statt ueberschrieben. vLT3/VLaMax gibt
    es dagegen keine Ableitungsformel aus Wettkampfzeiten, daher immer
    direkt vom Client setzbar. Alle Felder optional - nur mitgeschickte
    Werte werden aktualisiert."""

    name: str | None = None
    email: EmailStr | None = None
    hr_rest: float | None = None
    hr_max: float | None = None
    trimp_exponent_factor: float | None = None
    trimp_weight_factor: float | None = None
    load_k: float | None = None
    cs_use_vlt3: bool | None = None
    pace_zones_manual: bool | None = None
    threshold_pace_sec_per_km: float | None = None
    vo2max_pace_sec_per_km: float | None = None
    easy_pace_sec_per_km: float | None = None
    marathon_pace_sec_per_km: float | None = None
    repetition_pace_sec_per_km: float | None = None
    easy_pace_min_sec_per_km: float | None = None
    easy_pace_max_sec_per_km: float | None = None
    marathon_pace_min_sec_per_km: float | None = None
    marathon_pace_max_sec_per_km: float | None = None
    threshold_pace_min_sec_per_km: float | None = None
    threshold_pace_max_sec_per_km: float | None = None
    vo2max_pace_min_sec_per_km: float | None = None
    vo2max_pace_max_sec_per_km: float | None = None
    repetition_pace_min_sec_per_km: float | None = None
    repetition_pace_max_sec_per_km: float | None = None
    vlt3_pace_sec_per_km: float | None = None
    vla_max: float | None = None
    vo2max_measured: float | None = None
    ftp_watts: float | None = None
    warmup_pace_sec_per_km: float | None = None
    cooldown_pace_sec_per_km: float | None = None
    warmup_watts: float | None = None
    cooldown_watts: float | None = None
    race_100m_time_s: float | None = None
    race_400m_time_s: float | None = None
    race_800m_time_s: float | None = None
    race_1500m_time_s: float | None = None
    race_5k_time_s: float | None = None
    race_10k_time_s: float | None = None
    race_hm_time_s: float | None = None
    race_marathon_time_s: float | None = None
    birth_date: date | None = None
    gender: Gender | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    weekly_rhythm_note: str | None = None
    goal_race_name: str | None = None
    goal_race_date: date | None = None
    goal_time_s: float | None = None
    goals_note: str | None = None
    notes: str | None = None
    # Kleines Profilbild als Data-URL, clientseitig bereits herunterskaliert
    # (siehe AvatarUpload.tsx) - max_length als grobe Serverseiten-Bremse
    # gegen versehentlich unskalierte/zu grosse Uploads (~300 KB Data-URL).
    avatar: str | None = Field(default=None, max_length=300_000)


ZONE_FIELDS = {
    "hr_rest",
    "hr_max",
    "vlt3_pace_sec_per_km",
    "vla_max",
    "vo2max_measured",
    "ftp_watts",
    "warmup_pace_sec_per_km",
    "cooldown_pace_sec_per_km",
    "warmup_watts",
    "cooldown_watts",
    "race_100m_time_s",
    "race_400m_time_s",
    "race_800m_time_s",
    "race_1500m_time_s",
    "race_5k_time_s",
    "race_10k_time_s",
    "race_hm_time_s",
    "race_marathon_time_s",
    "pace_zones_manual",
    "threshold_pace_sec_per_km",
    "vo2max_pace_sec_per_km",
    "easy_pace_sec_per_km",
    "marathon_pace_sec_per_km",
    "repetition_pace_sec_per_km",
    "easy_pace_min_sec_per_km",
    "easy_pace_max_sec_per_km",
    "marathon_pace_min_sec_per_km",
    "marathon_pace_max_sec_per_km",
    "threshold_pace_min_sec_per_km",
    "threshold_pace_max_sec_per_km",
    "vo2max_pace_min_sec_per_km",
    "vo2max_pace_max_sec_per_km",
    "repetition_pace_min_sec_per_km",
    "repetition_pace_max_sec_per_km",
}


class PasswordChangeIn(BaseModel):
    """Payload fuer PUT /api/auth/me/password."""

    current_password: str
    new_password: str = Field(min_length=8)


class AccountDeleteIn(BaseModel):
    """Payload fuer DELETE /api/auth/me - Passwort-Bestaetigung vor dem
    (irreversiblen) Loeschen des eigenen Kontos."""

    password: str


class PasswordResetRequestIn(BaseModel):
    """Payload fuer POST /api/auth/forgot-password."""

    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    """Payload fuer POST /api/auth/reset-password."""

    token: str
    new_password: str = Field(min_length=8)
