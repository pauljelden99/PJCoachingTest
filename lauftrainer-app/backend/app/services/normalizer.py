"""
Verbindet die Rohdaten einer manuellen Trainingseingabe mit der
Berechnungs-Engine.

Das ist der zentrale Ort, an dem "Rohdaten -> ein Aktivitaets-Datensatz mit
daily_load und zone_km" passiert - api/activities.py ruft ausschliesslich
diese eine Funktion auf, damit die Prioritaetslogik fuer die Lastberechnung
an einer einzigen Stelle gepflegt wird.
"""

from dataclasses import dataclass, field
from datetime import datetime

from app.services import training_load as tl
from app.services.analytics import effective_vo2max
from app.services.zone_classifier import (
    PaceZones,
    Split,
    classify_distance,
    expand_segment_reps,
    zone_km_from_target,
    zone_reference_velocity_mps,
)


@dataclass
class NormalizedActivity:
    """Rohdaten einer manuellen Trainingseingabe (siehe api/activities.py) -
    ein einheitliches Format, unabhaengig davon, ob build_activity_record
    beim Anlegen (POST /api/activities/manual) oder Korrigieren
    (PUT /api/activities/{id}) einer Einheit aufgerufen wird."""

    external_id: str
    start_time: datetime
    duration_s: float
    distance_m: float | None
    avg_hr: float | None
    # [{"distance_km": 1.0, "duration_s": 300}, ...] - optionale
    # Kilometersplits (siehe normalizer.py, das dann eine feinere
    # Zonen-Verteilung als die grobe Zielzonen-Zuordnung liefert)
    splits: list[dict] = field(default_factory=list)
    # Hoehenmeter (Gesamtanstieg) - bei Laeufen Grundlage der Grade
    # Adjusted Pace (siehe training_load.grade_adjustment_factor), sonst
    # rein informativ. None wenn nicht erfasst.
    elevation_gain_m: float | None = None


# Zielzonen-Namen, unter denen eine Einheit ueber die athletenspezifische
# Pace-Kalibrierung (PaceZones) statt HF/Zonen-Durchschnitt gerechnet wird -
# Radfahren nutzt eigene, geklammerte Zonennamen (siehe frontend/src/lib/
# plan.ts:CYCLING_ZONES) und ist damit hier bewusst ausgeschlossen.
# "Sprint/Reps" bewusst dabei (siehe services/training_zones.py:PACE_ZONES-
# Kommentar): eine Sprint-/Reps-Einheit ohne Segmente/Splits geht hier ueber
# ihre Durchschnittsgeschwindigkeit in die Lastberechnung ein, analog zu
# einem einfachen GA1-Dauerlauf - eine zonenspezifische Referenzgeschwindigkeit
# (zone_reference_velocity_mps) gibt es fuer Sprints dagegen bewusst nicht
# (keine sinnvolle kontinuierliche Pace-Grenze), daher NICHT im Fallback
# unten (zone_km-Branch), der genau diese Funktion braucht.
PACE_ZONE_NAMES = ("GA1", "Schwelle", "VO2max", "Sprint/Reps")


def build_activity_record(
    normalized: NormalizedActivity,
    athlete_hr_rest: float | None,
    athlete_hr_max: float | None,
    pace_zones: PaceZones | None,
    manual_rpe: float | None = None,
    athlete_is_female: bool = False,
    trimp_exponent_factor: float | None = None,
    trimp_weight_factor: float | None = None,
    load_k: float | None = None,
    cs_use_vlt3: bool = False,
    athlete_race_times_s: dict[str, float | None] | None = None,
    target_zone: str | None = None,
    segments: list[dict] | None = None,
) -> dict:
    """Berechnet daily_load und (falls moeglich) die Zonen-Verteilung
    fuer eine manuell eingegebene Aktivitaet.

    `manual_rpe` (subjektiv empfundene Anstrengung, 0-10) wird nicht mehr
    in die Trainingslast eingerechnet, siehe unten - der Parameter bleibt
    ausschliesslich als reine Notiz der Aufrufer erhalten (Activity.rpe).

    `load_k` ist ein manueller Override (User.load_k) fuer den
    Kostenexponenten K der Pace-Kostenfunktion; ohne ihn wird K aus dem
    Riegel-Ermuedungsexponenten ueber `athlete_race_times_s` (Dict im
    User-Feldnamen-Format, siehe training_load.RACE_DISTANCES_M)
    berechnet - siehe training_load.resolve_load_k.

    Bei Laeufen mit hinterlegten Hoehenmetern (normalized.elevation_gain_m)
    wird jede in die Lastberechnung eingehende Geschwindigkeit zuvor per
    Minetti-Laufkostenmodell auf eine Grade Adjusted Pace umgerechnet
    (training_load.grade_adjustment_factor) - mangels Hoehenprofil als eine
    ueber die gesamte Distanz konstant angenommene mittlere Steigung.

    Prioritaet der Lastberechnung:
    1. Strukturierte Segmente (Activity.segments, z.B. eine Intervall- oder
       Tempoeinheit) mit bestimmbarer Pace je Wiederholung (siehe
       zone_classifier.expand_segment_reps) - am praezisesten, da jede
       Wiederholung einzeln statt als Gesamtdurchschnitt in die (v/vLT3)^K-
       Kostenfunktion eingeht (ein Mittelwert aus schnellen Intervallen und
       lockeren Pausen wuerde die stark konvexe Kostenfunktion massiv
       unterschaetzen).
    2. Eine einzelne Pace-Zonen-Einheit (target_zone in PACE_ZONE_NAMES) mit
       Gesamtdistanz und -dauer: die daraus abgeleitete Durchschnitts-
       geschwindigkeit wird direkt (grade-adjustiert) als ein Sample in die
       Kostenfunktion gegeben - praeziser als eine Zonen-Pauschale, da sie
       die tatsaechlich gelaufene Pace statt einer Zonen-Referenzgeschwindigkeit
       nutzt.
    3. HF-basiertes TRIMP, falls HF-Daten und Athletenprofil vorhanden (die
       einzig sinnvolle Methode ohne athletenspezifische Pace-Kalibrierung,
       z.B. bei Rad/Schwimmen oder fehlenden Pace-Zonen).
    4. Kontinuierliche Pace-Last aus einer groben Zonen-Verteilung (Splits
       oder zone_km_from_target), falls Pace-Zonen hinterlegt sind - je Zone
       eine repraesentative Geschwindigkeit statt echter Werte (siehe
       zone_classifier.zone_reference_velocity_mps).
    5. sonst 0.0 (Aktivitaet wird gespeichert, geht aber nicht in die
       Trainingslast ein - z.B. reine Athletik-/Beweglichkeitseinheit ohne
       Distanzbezug und ohne HF-Daten)

    Zusaetzlich, unabhaengig von obiger Prioritaet: ein Extra-Last-Term
    oberhalb der Critical Speed (CS) aus dem D'-Balance-Modell (siehe
    training_load.w_prime_balance_extra_load), sofern `segments` eine
    Intervallstruktur enthalten und sich CS/D' aus den Bestzeiten
    bestimmen lassen (training_load.critical_speed_model/
    resolve_critical_speed_mps - CS-Quelle steuerbar ueber `cs_use_vlt3`).
    Wird additiv zur obigen Last aufgeschlagen.

    zone_km stammt bevorzugt aus GPS-/manuellen Kilometersplits +
    Pace-Zonen (`classify_distance`); ohne Splits faellt es auf
    `zone_km_from_target` zurueck (Segmente bzw. die gewaehlte Zielzone der
    Einheit) - sonst bliebe zone_km fuer die meisten Einheiten leer.

    Enthaelt zusaetzlich `effective_vo2max` aus Distanz/Dauer
    (Daniels-Gilbert-VDOT-Formel, siehe services/analytics.py) - nur wenn
    sowohl Puls (avg_hr) als auch athletenspezifische Tempobereiche
    (pace_zones) vorliegen, sonst None (auch ohne Distanz/bei zu kurzer
    Dauer, siehe effective_vo2max). RPE fliesst dabei bewusst NICHT ein.
    `elevation_gain_m` wird unveraendert durchgereicht.

    Gibt ein dict mit exakt den Feldnamen des Activity-Modells zurueck,
    sodass es per `Activity(**record)` direkt verwendet werden kann.
    """
    duration_min = normalized.duration_s / 60
    athlete_race_times_s = athlete_race_times_s or {}
    segments = segments or []

    # Distanz einheitlich auf 100m (eine Nachkommastelle in km) runden -
    # gegen beliebig genaue Nutzereingaben in km (ManualActivityForm.tsx).
    distance_m = round(normalized.distance_m / 100) * 100 if normalized.distance_m else normalized.distance_m

    gap_factor = tl.grade_adjustment_factor(normalized.elevation_gain_m, distance_m)

    if normalized.splits and pace_zones:
        splits = [Split(**s) for s in normalized.splits]
        zone_km = classify_distance(splits, pace_zones)
    else:
        zone_km = zone_km_from_target(distance_m, target_zone, segments)

    effective_k = tl.resolve_load_k(load_k, athlete_race_times_s)
    segment_samples = expand_segment_reps(segments) if segments else []

    if segment_samples and pace_zones:
        samples = [(v_mps * gap_factor, duration_s) for v_mps, duration_s in segment_samples]
        daily_load = tl.load_from_velocity_samples(samples, pace_zones.v_lt3_mps, effective_k)
    elif target_zone in PACE_ZONE_NAMES and distance_m and normalized.duration_s and pace_zones:
        avg_velocity_mps = distance_m / normalized.duration_s
        daily_load = tl.load_from_velocity_samples(
            [(avg_velocity_mps * gap_factor, normalized.duration_s)], pace_zones.v_lt3_mps, effective_k
        )
    elif normalized.avg_hr and athlete_hr_rest and athlete_hr_max:
        daily_load = tl.load_from_hr_trimp(
            duration_min,
            normalized.avg_hr,
            athlete_hr_rest,
            athlete_hr_max,
            is_female=athlete_is_female,
            exponent_factor=trimp_exponent_factor,
            weight_factor=trimp_weight_factor,
        )
    elif zone_km and pace_zones:
        total_km = sum(zone_km.values()) or 1
        samples = [
            (zone_reference_velocity_mps(zone, pace_zones), duration_min * 60 * (km / total_km))
            for zone, km in zone_km.items()
            if km
        ]
        daily_load = tl.load_from_velocity_samples(samples, pace_zones.v_lt3_mps, effective_k)
    else:
        daily_load = 0.0

    computed_cs_fit = tl.critical_speed_model(athlete_race_times_s)
    computed_cs_mps, d_prime_m = computed_cs_fit if computed_cs_fit else (None, None)
    cs_mps = tl.resolve_critical_speed_mps(
        cs_use_vlt3, computed_cs_mps, pace_zones.v_lt3_mps if pace_zones else None
    )
    daily_load += tl.w_prime_balance_extra_load(segments, cs_mps, d_prime_m)

    # Nur schaetzen, wenn sowohl Puls (avg_hr) als auch athletenspezifische
    # Tempobereiche (pace_zones) vorliegen - ohne Puls fehlt der Abgleich,
    # ob die gelaufene Pace tatsaechlich der beanspruchten Anstrengung
    # entsprach (z.B. ein "leicht" gelaufener, aber zufaellig schneller
    # Lauf wuerde sonst einen zu hohen VDOT vortaeuschen), und ohne
    # Tempobereiche fehlt die Referenz, um die Pace ueberhaupt einzuordnen.
    # RPE (subjektiv empfundene Anstrengung) fliesst bewusst NICHT ein -
    # zu unzuverlaessig/inkonsistent zwischen Athleten fuer eine
    # physiologische Kennzahl wie den VDOT.
    vo2max = effective_vo2max(distance_m, normalized.duration_s) if normalized.avg_hr and pace_zones else None

    return {
        "external_id": normalized.external_id,
        "start_time": normalized.start_time,
        "duration_s": normalized.duration_s,
        "distance_m": distance_m,
        "avg_hr": normalized.avg_hr,
        "splits": normalized.splits,
        "daily_load": daily_load,
        "zone_km": zone_km,
        "effective_vo2max": vo2max,
        "elevation_gain_m": normalized.elevation_gain_m,
        "rpe": manual_rpe,
    }
