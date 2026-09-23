from __future__ import annotations

import enum
from datetime import datetime, date

from sqlalchemy import String, Float, DateTime, Enum, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    ATHLETE = "athlete"
    TRAINER = "trainer"
    ADMIN = "admin"


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    DIVERSE = "diverse"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.ATHLETE)

    # Nur fuer Trainer-Accounts relevant: erweitert einen Trainer um
    # Admin-Rechte (Konten anlegen, siehe core/deps.py:require_admin), ohne
    # ihn zum eigentlichen `role=admin` zu machen (der bleibt athletenfrei,
    # siehe deps.py). Admins (role=ADMIN) haben Admin-Rechte immer, unabhaengig
    # von diesem Feld. Beim Anlegen eines Trainers vom Admin/admin-Trainer
    # explizit waehlbar (siehe schemas/user.py:TrainerCreate); bestehende
    # Trainer-Accounts wurden per Migration auf True gesetzt, da vor
    # Einfuehrung dieses Felds jeder Trainer implizit Admin-Rechte hatte.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Athletenspezifisch - fuer Trainer-Accounts bleiben diese Felder leer.
    # Fuer die HF-basierte TRIMP-Berechnung (services/training_load.py)
    hr_rest: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_max: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Ueberschreibt die geschlechtsspezifischen Standardkonstanten der
    # Banister-TRIMP-Formel (services/training_load.py:load_from_hr_trimp)
    # fuer diesen Athleten. NULL = Standardformel (nach `gender`). Vom
    # Trainer im Athletenprofil pflegbar (siehe schemas/user.py:
    # UserProfileUpdate), falls die Standardwerte fuer einen Athleten
    # unplausible Lastwerte liefern.
    trimp_exponent_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
    trimp_weight_factor: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Ueberschreibt fuer diesen Athleten den Kostenexponenten K der
    # kontinuierlichen Pace-Kostenfunktion (services/training_load.py:
    # load_from_velocity_samples, Last = Minuten * (v/vLT3)^K). NULL
    # (Standard) berechnet K automatisch aus dem Riegel-Ermuedungsexponenten
    # ueber alle hinterlegten Bestzeiten (siehe training_load.riegel_
    # exponent/k_from_riegel_exponent/resolve_load_k); reichen die
    # Bestzeiten dafuer nicht, greift LOAD_K_DEFAULT.
    load_k: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Steuert, welche Geschwindigkeit als Critical Speed (CS) fuer den
    # D'-Balance-Extra-Term oberhalb CS dient (services/training_load.py:
    # w_prime_balance_extra_load/resolve_critical_speed_mps): False
    # (Standard) nutzt den aus den Bestzeiten berechneten CS
    # (critical_speed_model), True nutzt stattdessen vlt3_pace_sec_per_km.
    # D' (anaerobe Kapazitaet) kommt in beiden Faellen aus
    # critical_speed_model - dieses Feld waehlt nur die CS-Quelle, nicht D'.
    cs_use_vlt3: Mapped[bool] = mapped_column(Boolean, default=False)

    # Fuer die Pace-Zonen-Klassifizierung (services/zone_classifier.py) -
    # standardmaessig (pace_zones_manual=False) serverseitig aus
    # race_10k_time_s/race_5k_time_s abgeleitet (siehe
    # services/user_profile.py:apply_profile_update). Bei
    # pace_zones_manual=True setzt der Trainer diese beiden Werte
    # stattdessen direkt (analog zum trimp_*_factor-Override-Muster oben) -
    # z.B. wenn ein Laktatstufentest genauere Werte liefert als die grobe
    # Wettkampfzeiten-Naeherung.
    pace_zones_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    threshold_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2max_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Manuelle Ueberschreibung der uebrigen drei Zonen der Jack-Daniels-
    # Trainingsbereichtabelle (frontend/src/lib/danielsZones.ts) - Easy und
    # Marathon (langsamer als Threshold) sowie Repetition (schneller als
    # Interval/VO2max). Threshold und Interval nutzen dafuer bereits
    # threshold_pace_sec_per_km/vo2max_pace_sec_per_km oben, da beide
    # Zonenmodelle (3-Zonen-Klassifizierung GA1/Schwelle/VO2max und die
    # 5-Zonen-Daniels-Tabelle) an diesen beiden Punkten uebereinstimmen.
    # Wie oben nur wirksam, wenn pace_zones_manual=True gesetzt ist - sonst
    # berechnet das Frontend alle fuenf Zonen aus dem VDOT der besten
    # Wettkampfzeit (computeDanielsZones), NULL faellt dort automatisch auf
    # den berechneten Wert zurueck (pro Zone einzeln, nicht alles-oder-
    # nichts).
    easy_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    marathon_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    repetition_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Trainer-gesetzte obere/untere Pace-Grenze je Daniels-Zone (nur wirksam
    # bei pace_zones_manual=True, jeweils nur wenn BEIDE Felder einer Zone
    # gesetzt sind - siehe frontend/src/lib/danielsZones.ts:
    # computeDanielsZones). Ersetzt die vorherige Naeherung ueber die
    # Mittelwerte der Nachbarzonen fuer manuell gesetzte Zonen: der Trainer
    # gibt die Grenzen direkt an, statt sie aus einem einzelnen
    # Zonen-Mittelwert schaetzen zu lassen. "*_min" ist die schnellere
    # (kleinerer Sekundenwert), "*_max" die langsamere Grenze. Der jeweils
    # einzelne Mittelwert (easy_pace_sec_per_km etc. oben) bleibt zusaetzlich
    # als repraesentativer Wert gepflegt (Mittelwert aus min/max), da andere
    # Ableitungen (z.B. lib/paceZones.ts:deriveZonePace) weiterhin einen
    # einzelnen Wert je Zone erwarten.
    easy_pace_min_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    easy_pace_max_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    marathon_pace_min_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    marathon_pace_max_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_pace_min_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_pace_max_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2max_pace_min_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2max_pace_max_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    repetition_pace_min_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    repetition_pace_max_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Laktat-Leistungsdiagnostik-Kennwerte - im Gegensatz zu den beiden
    # Feldern oben nicht aus Wettkampfzeiten ableitbar, daher direkt vom
    # Client setzbar (siehe schemas/user.py:UserProfileUpdate).
    vlt3_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)  # Pace bei 3 mmol/l Laktat
    vla_max: Mapped[float | None] = mapped_column(Float, nullable=True)  # maximale Laktatbildungsrate (mmol/l/s)
    # In der Leistungsdiagnostik (Spiroergometrie) gemessene VO2max -
    # unabhaengig vom je Trainingseinheit geschaetzten "effektiven" VO2max
    # (services/analytics.py:effective_vo2max), daher ein eigenes Feld statt
    # einer Ableitung.
    vo2max_measured: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Schwellenleistung (FTP, funktionelle Schwellenleistung in Watt) fuer
    # Radeinheiten - Grundlage der Rad-Zonen (services/watt_zones.py),
    # analog zu threshold_pace_sec_per_km beim Laufen. Anders als bei Pace
    # gibt es keine Ableitungsformel aus Wettkampfzeiten, daher direkt vom
    # Athleten/Trainer eingetragen (kein *_manual-Override-Feld noetig).
    ftp_watts: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Vom Trainer im Athletenprofil hinterlegte feste Pace-/Watt-Vorgaben
    # fuer Auf-/Abwaermen (frontend/src/components/AthleteProfileForm.tsx),
    # die statt der sonst genutzten generischen Schaetzung (Easy-Pace +
    # Offset beim Laufen, GA1-basierte Watt-Schaetzung beim Radfahren -
    # siehe frontend/src/lib/paceZones.ts:deriveZonePace bzw.
    # wattZones.ts:deriveZoneWatts) automatisch in neue Segmente uebernommen
    # werden. Optional wie ftp_watts, kein *_manual-Override-Feld noetig.
    warmup_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    cooldown_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    warmup_watts: Mapped[float | None] = mapped_column(Float, nullable=True)
    cooldown_watts: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Wettkampfzeiten in Sekunden - Grundlage fuer die abgeleiteten Pace-
    # Felder oben sowie fuer die Bakken-Zonentabelle im Frontend
    # (lib/bakkenZones.ts). Alle optional, da nicht jeder Athlet alle
    # Distanzen laeuft.
    race_100m_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_400m_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_800m_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_1500m_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_5k_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_10k_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_hm_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    race_marathon_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)

    zones_last_updated: Mapped[date | None] = mapped_column(nullable=True)

    # Stammdaten
    birth_date: Mapped[date | None] = mapped_column(nullable=True)
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Freitext-Wochenrhythmus (z.B. "i.d.R. Di/Do/Sa/So") - bewusst kein
    # strukturiertes Format, siehe app/schemas/user.py
    weekly_rhythm_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ziele: strukturierter Zielwettkampf plus ergaenzender Freitext
    goal_race_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    goal_race_date: Mapped[date | None] = mapped_column(nullable=True)
    goal_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    goals_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sonstige Anmerkungen
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Kleines Profilbild als Data-URL (z.B. "data:image/jpeg;base64,...") -
    # clientseitig bereits auf eine kleine Kantenlaenge herunterskaliert
    # (siehe frontend/src/components/AvatarUpload.tsx), daher als Text-Spalte
    # statt eigenem Datei-Upload-Mechanismus (die App hat sonst keinerlei
    # Datei-Upload-Infrastruktur, alle anderen Requests sind reines JSON).
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    activities: Mapped[list["Activity"]] = relationship(back_populates="athlete")
    planned_sessions: Mapped[list["PlannedSession"]] = relationship(back_populates="athlete")
