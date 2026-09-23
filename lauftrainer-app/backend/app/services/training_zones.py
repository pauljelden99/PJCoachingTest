"""
Aggregiert Zeit-in-Zone (Tempo + Herzfrequenz) ueber einen Zeitraum sowie
den Plan-vs-Ist-Abgleich zwischen PlannedSession und den tatsaechlichen
Activities desselben Zeitraums, pro Zone aggregiert (nicht mehr
tagesweise - ein Wochen-/Monatsvergleich soll nicht durch Wetter-/
Streckenabweichungen einzelner Tage verzerrt werden, sondern zeigen, ob
insgesamt genug in jeder Zone trainiert wurde).

Reine Funktionen (kein DB-Zugriff), analog zu services/training_load.py
und services/analytics.py - siehe tests/test_training_zones.py. Die
DB-Anbindung passiert in app/api/training_zones.py.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from app.services.hr_zones import HrZones, ZONE_BOUNDS, classify_hr
from app.services.zone_classifier import PaceZones, zone_km_from_target

# Nicht-lauf-spezifische Einheitstypen (siehe PlannedSession.target_duration_s
# und frontend/src/lib/plan.ts:zoneUsesDuration) - laufen ueber Minuten statt
# km, da eine Distanz fuer diese Einheitstypen im Zonenmodell keinen Sinn
# ergibt (Radfahren/Schwimmen liessen sich zwar ueber eine Distanz erfassen,
# aber nicht sinnvoll in dieselben Lauf-Pace-Zonen einordnen). Radfahren/
# Schwimmen werden zusaetzlich nach Intensitaet (GA1/Schwelle/VO2max)
# geplant (siehe frontend/src/lib/plan.ts:CYCLING_ZONES/SWIMMING_ZONES) -
# dafuer gibt es aber keine athletenspezifische Pace-Ableitung wie beim
# Laufen, daher zaehlen auch diese Varianten hier zu den dauerbasierten Zonen.
CYCLING_ZONES = ("Radfahren (GA1)", "Radfahren (Schwelle)", "Radfahren (VO2max)")
SWIMMING_ZONES = ("Schwimmen (GA1)", "Schwimmen (Schwelle)", "Schwimmen (VO2max)")
OTHER_ZONES = ("Athletik", "Beweglichkeit", "Krafttraining")
DURATION_ZONES = (*OTHER_ZONES, *CYCLING_ZONES, *SWIMMING_ZONES)
# "Sprint/Reps" (kurze Maximalsprints/Reps, z.B. 10x100m) ist als vierte
# Lauf-Zone bewusst hier bei PACE_ZONES statt bei DURATION_ZONES gefuehrt:
# anders als Fahrtspiel (siehe PlannedSession.method/Activity.method - eine
# Methodik-Variante EINER Schwelleneinheit, keine eigene Zone) hat eine
# Sprint-/Reps-Einheit eine eigene, klar abgrenzbare Zielsetzung
# (Maximalgeschwindigkeit/Schnelligkeit statt Ausdauer) und wird wie
# Schwelle/VO2max ueber Distanz und strukturierte Segmente geplant (siehe
# frontend/src/lib/plan.ts:SEGMENT_ZONES) - nur eben ohne automatische
# Pace-Ableitung aus den Trainingsbereichen (keine sinnvolle kontinuierliche
# Pace-Grenze fuer Sprints), die Segment-Paces werden dafuer frei
# eingegeben (siehe frontend/src/lib/paceZones.ts:deriveZonePace).
PACE_ZONES = ("GA1", "Schwelle", "VO2max", "Sprint/Reps")


def sport_of_target_zone(target_zone: str | None) -> str | None:
    """Ordnet die Zielzone einer Einheit ihrer Sportart zu (fuer eine reine
    Distanz-Aufteilung nach Sportart, siehe services/analytics.py:
    weekly_volume_by_sport) - None, wenn keine Zielzone gesetzt ist oder es
    sich um eine distanzlose Einheit (Athletik/Beweglichkeit/Krafttraining)
    handelt."""
    if target_zone in PACE_ZONES:
        return "run"
    if target_zone in CYCLING_ZONES:
        return "bike"
    if target_zone in SWIMMING_ZONES:
        return "swim"
    return None


@dataclass(frozen=True)
class ActivityZoneInput:
    day: date
    distance_m: float | None
    duration_s: float
    avg_hr: float | None
    zone_km: dict[str, float]
    target_zone: str | None = None


def pace_zone_km(activities: list[ActivityZoneInput], pace_zones: PaceZones | None) -> dict[str, float]:
    """Kilometer pro Tempozone, aus dem bei Activity-Erstellung/-Bearbeitung
    berechneten und persistierten Activity.zone_km summiert (siehe
    services/normalizer.py:build_activity_record) - dort bevorzugt aus
    GPS-Kilometersplits + Pace-Zonen abgeleitet, sonst (z.B. eine manuelle
    Eingabe ohne Trackaufzeichnung) aus Segmenten/Zielzone der Einheit
    (zone_classifier.zone_km_from_target). Ein reines Neuberechnen aus
    Splits wie zuvor liesse zone_km fuer die meisten manuell erfassten
    Einheiten leer, da dort schlicht keine Kilometersplits existieren."""
    totals = {zone: 0.0 for zone in PACE_ZONES}
    if pace_zones is None:
        return totals
    for activity in activities:
        for zone, km in activity.zone_km.items():
            totals[zone] = totals.get(zone, 0.0) + km
    return {zone: round(km, 1) for zone, km in totals.items()}


def pace_zone_minutes(activities: list[ActivityZoneInput], pace_zones: PaceZones | None) -> dict[str, float]:
    """Zeit (Minuten) pro Tempozone - die Gesamtzeit einer Einheit wird
    proportional zum Kilometeranteil jeder Zone in ihrem (persistierten)
    Activity.zone_km verteilt (analog zur Lastverteilung in
    normalizer.py:build_activity_record), statt wie zuvor separat aus
    GPS-Kilometersplits neu berechnet zu werden - dieselbe Datengrundlage
    wie pace_zone_km, damit Zeit- und Kilometeranzeige fuer denselben
    Zeitraum konsistent bleiben und auch fuer splitlose manuelle Eingaben
    funktionieren."""
    totals = {zone: 0.0 for zone in PACE_ZONES}
    if pace_zones is None:
        return totals
    for activity in activities:
        total_km = sum(activity.zone_km.values())
        if total_km <= 0:
            continue
        duration_min = activity.duration_s / 60
        for zone, km in activity.zone_km.items():
            totals[zone] = totals.get(zone, 0.0) + duration_min * (km / total_km)
    return totals


def hr_zone_minutes(activities: list[ActivityZoneInput], hr_zones: HrZones | None) -> dict[str, float]:
    """Zeit (Minuten) pro HF-Zone. Jede Einheit wird als Ganzes ueber
    ihren Durchschnittspuls einer Zone zugeordnet (siehe Einschraenkung
    in services/hr_zones.py)."""
    totals = {label: 0.0 for label, _ in ZONE_BOUNDS}
    if hr_zones is None:
        return totals
    for activity in activities:
        if activity.avg_hr is None:
            continue
        zone = classify_hr(activity.avg_hr, hr_zones)
        totals[zone] = totals.get(zone, 0.0) + activity.duration_s / 60
    return totals


@dataclass(frozen=True)
class PlannedSessionInput:
    day: date
    title: str
    target_zone: str | None
    target_distance_km: float | None
    target_duration_s: float | None = None
    # Segmente der geplanten Einheit (PlanSegment als dict, siehe
    # models/training_plan.py) - fuer dieselbe pro-Abschnitt-Zonenaufteilung
    # wie bei protokollierten Einheiten (siehe zone_km_from_target unten),
    # statt die gesamte target_distance_km pauschal der Zielzone
    # zuzuschlagen (was z.B. das GA1-Auf-/Abwaermen einer Schwelleneinheit
    # faelschlich als Schwellen-Kilometer zaehlen wuerde).
    segments: list[dict] | None = None


@dataclass(frozen=True)
class ZoneSummaryPoint:
    zone: str
    unit: str  # "km" | "minutes"
    planned: float
    actual: float
    pct: float | None  # actual/planned*100, None wenn nichts geplant war


def compute_zone_summary(
    planned_sessions: list[PlannedSessionInput],
    activities: list[ActivityZoneInput],
    pace_zones: PaceZones | None,
) -> list[ZoneSummaryPoint]:
    """Vergleicht geplante mit tatsaechlichen Einheiten aggregiert ueber den
    gesamten Abfragezeitraum (nicht mehr tagesweise, siehe Moduldoc): fuer
    GA1/Schwelle/VO2max in Kilometern, fuer Athletik/Beweglichkeit in
    Minuten, da dort keine Distanz existiert."""
    planned_km: dict[str, float] = {zone: 0.0 for zone in PACE_ZONES}
    planned_minutes: dict[str, float] = {zone: 0.0 for zone in DURATION_ZONES}
    for planned in planned_sessions:
        if planned.target_zone in PACE_ZONES and planned.target_distance_km:
            # Wie bei protokollierten Einheiten (siehe pace_zone_km oben) aus
            # den Segmenten pro Abschnitt aufgeteilt, wenn vorhanden - sonst
            # (z.B. ein GA1-Dauerlauf ohne Segmente) faellt zone_km_from_target
            # auf die volle Distanz in der Zielzone zurueck.
            for zone, km in zone_km_from_target(
                planned.target_distance_km * 1000, planned.target_zone, planned.segments
            ).items():
                planned_km[zone] = planned_km.get(zone, 0.0) + km
        elif planned.target_zone in DURATION_ZONES and planned.target_duration_s:
            planned_minutes[planned.target_zone] += planned.target_duration_s / 60

    actual_km = pace_zone_km(activities, pace_zones)
    actual_minutes: dict[str, float] = {zone: 0.0 for zone in DURATION_ZONES}
    for activity in activities:
        if activity.target_zone in DURATION_ZONES:
            actual_minutes[activity.target_zone] += activity.duration_s / 60

    points = [
        ZoneSummaryPoint(
            zone=zone,
            unit="km",
            planned=round(planned_km[zone], 1),
            actual=round(actual_km.get(zone, 0.0), 1),
            pct=round(actual_km.get(zone, 0.0) / planned_km[zone] * 100, 1) if planned_km[zone] else None,
        )
        for zone in PACE_ZONES
    ]
    points += [
        ZoneSummaryPoint(
            zone=zone,
            unit="minutes",
            planned=round(planned_minutes[zone], 1),
            actual=round(actual_minutes[zone], 1),
            pct=round(actual_minutes[zone] / planned_minutes[zone] * 100, 1) if planned_minutes[zone] else None,
        )
        for zone in DURATION_ZONES
    ]
    return points


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


@dataclass(frozen=True)
class WeeklyZoneSummaryPoint:
    week_start: date  # Montag der jeweiligen Kalenderwoche
    zone: str
    unit: str  # "km" | "minutes"
    planned: float
    actual: float


def compute_weekly_zone_summary(
    planned_sessions: list[PlannedSessionInput],
    activities: list[ActivityZoneInput],
    pace_zones: PaceZones | None,
    range_start: date,
    range_end: date,
) -> list[WeeklyZoneSummaryPoint]:
    """Wie compute_zone_summary, aber pro Kalenderwoche (Montag als
    Wochenanfang) statt ueber den gesamten Zeitraum aggregiert - fuer den
    woechentlichen Plan-vs-Ist-Vergleich im Dashboard
    (WeeklyZoneComparisonChart). Ergebnis als flache Liste (ein Punkt pro
    Woche x Zone), das Frontend pivotiert das fuer die Chart-Darstellung.
    Wochen ohne jegliche Planung/Aktivitaet in einer Zone werden
    ausgelassen (planned=actual=0 waere fuer die Chart-Achse nur Rauschen)."""
    weeks: list[date] = []
    w = _week_start(range_start)
    last_week = _week_start(range_end - timedelta(days=1))
    while w <= last_week:
        weeks.append(w)
        w += timedelta(days=7)

    planned_km: dict[date, dict[str, float]] = defaultdict(lambda: {zone: 0.0 for zone in PACE_ZONES})
    planned_minutes: dict[date, dict[str, float]] = defaultdict(lambda: {zone: 0.0 for zone in DURATION_ZONES})
    for planned in planned_sessions:
        week = _week_start(planned.day)
        if planned.target_zone in PACE_ZONES and planned.target_distance_km:
            # Wie in compute_zone_summary oben (und wie bei protokollierten
            # Einheiten) pro Segment statt pauschal in der Zielzone gezaehlt.
            for zone, km in zone_km_from_target(
                planned.target_distance_km * 1000, planned.target_zone, planned.segments
            ).items():
                planned_km[week][zone] = planned_km[week].get(zone, 0.0) + km
        elif planned.target_zone in DURATION_ZONES and planned.target_duration_s:
            planned_minutes[week][planned.target_zone] += planned.target_duration_s / 60

    actual_km: dict[date, dict[str, float]] = defaultdict(lambda: {zone: 0.0 for zone in PACE_ZONES})
    actual_minutes: dict[date, dict[str, float]] = defaultdict(lambda: {zone: 0.0 for zone in DURATION_ZONES})
    for activity in activities:
        week = _week_start(activity.day)
        if pace_zones is not None:
            for zone, km in activity.zone_km.items():
                if zone in PACE_ZONES:
                    actual_km[week][zone] = actual_km[week].get(zone, 0.0) + km
        if activity.target_zone in DURATION_ZONES:
            actual_minutes[week][activity.target_zone] += activity.duration_s / 60

    points: list[WeeklyZoneSummaryPoint] = []
    for week in weeks:
        for zone in PACE_ZONES:
            planned_val = planned_km[week][zone]
            actual_val = actual_km[week].get(zone, 0.0)
            if planned_val or actual_val:
                points.append(
                    WeeklyZoneSummaryPoint(
                        week_start=week, zone=zone, unit="km", planned=round(planned_val, 1), actual=round(actual_val, 1)
                    )
                )
        for zone in DURATION_ZONES:
            planned_val = planned_minutes[week][zone]
            actual_val = actual_minutes[week].get(zone, 0.0)
            if planned_val or actual_val:
                points.append(
                    WeeklyZoneSummaryPoint(
                        week_start=week,
                        zone=zone,
                        unit="minutes",
                        planned=round(planned_val, 1),
                        actual=round(actual_val, 1),
                    )
                )
    return points


def compute_weekly_pace_zone_minutes(
    activities: list[ActivityZoneInput],
    pace_zones: PaceZones | None,
    range_start: date,
    range_end: date,
) -> list[WeeklyZoneSummaryPoint]:
    """Wie compute_weekly_zone_summary, aber die drei Lauf-Tempozonen in
    Minuten statt Kilometern (analog zu pace_zone_minutes, nur pro Woche
    statt ueber den Gesamtzeitraum). Eigenstaendige Funktion statt einer
    Erweiterung von compute_weekly_zone_summary, damit deren bestehende
    Konsumenten (WeeklyZoneComparisonChart/"Trainingserfuellung") unveraendert
    genau einen Eintrag pro Zone/Woche (in km) sehen - Grundlage der
    sportartuebergreifenden "Gesamt"-Ansicht des Kilometer-pro-Zone-Charts,
    wo Rad-/Schwimmzeiten (bereits in Minuten) mit Laufzeiten in derselben
    Einheit zusammengefasst werden koennen (anders als bei km)."""
    weeks: list[date] = []
    w = _week_start(range_start)
    last_week = _week_start(range_end - timedelta(days=1))
    while w <= last_week:
        weeks.append(w)
        w += timedelta(days=7)

    actual_minutes: dict[date, dict[str, float]] = defaultdict(lambda: {zone: 0.0 for zone in PACE_ZONES})
    if pace_zones is not None:
        for activity in activities:
            total_km = sum(activity.zone_km.values())
            if total_km <= 0:
                continue
            week = _week_start(activity.day)
            duration_min = activity.duration_s / 60
            for zone, km in activity.zone_km.items():
                if zone in PACE_ZONES:
                    actual_minutes[week][zone] = actual_minutes[week].get(zone, 0.0) + duration_min * (km / total_km)

    return [
        WeeklyZoneSummaryPoint(
            week_start=week, zone=zone, unit="minutes", planned=0.0, actual=round(actual_minutes[week].get(zone, 0.0), 1)
        )
        for week in weeks
        for zone in PACE_ZONES
    ]
