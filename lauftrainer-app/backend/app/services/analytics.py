"""
Datenanalyse-Engine: effektiver VO2max pro Trainingseinheit, Wochenkilometer,
Wettkampfprognosen sowie A:C Workload Ratio (Verletzungsrisiko) auf Basis der
bereits vorhandenen CTL/ATL-Zeitreihe (`services/training_load.py`).

Bewusst als reine, dependency-freie Funktionen geschrieben (kein DB-/API-
Zugriff) - gleiches Muster wie `training_load.py` und `zone_classifier.py`,
siehe `tests/test_analytics.py`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

from app.services.training_load import PmcPoint
from app.services.training_zones import DURATION_ZONES, PACE_ZONES, sport_of_target_zone
from app.services.zone_classifier import PaceZones

MIN_DURATION_S_FOR_VO2MAX = 3 * 60  # kuerzere Einheiten verzerren die VDOT-Schaetzung


def effective_vo2max(distance_m: float | None, duration_s: float) -> float | None:
    """Schaetzt den "effektiven" VO2max aus einer einzelnen Trainingseinheit
    nach der Daniels-Gilbert-VDOT-Formel (Daniels' Running Formula).

    velocity in m/min, t in Minuten. Liefert None fuer zu kurze/degenerierte
    Einheiten (< 3 min oder Distanz <= 0) oder distanzlose Einheiten
    (Athletik/Beweglichkeit, siehe Activity.distance_m), bei denen die
    Formel unplausible bzw. keine Werte liefert (z.B. ein 200m-Sprint hat
    keinen aussagekraeftigen VDOT).
    """
    if distance_m is None or duration_s < MIN_DURATION_S_FOR_VO2MAX or distance_m <= 0:
        return None

    t = duration_s / 60
    velocity = distance_m / t  # m/min

    vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity**2
    pct_vo2max = (
        0.8
        + 0.1894393 * math.exp(-0.012778 * t)
        + 0.2989558 * math.exp(-0.1932605 * t)
    )
    return vo2 / pct_vo2max




@dataclass(frozen=True)
class WeeklyVolumePoint:
    week_start: date
    km: float
    minutes: float


def weekly_volume(activities: list[tuple[date, float | None, float]]) -> list[WeeklyVolumePoint]:
    """Summiert gelaufene Kilometer/trainierte Minuten pro ISO-Kalenderwoche,
    UEBER ALLE Sportarten hinweg (anders als `weekly_volume_by_sport`) -
    Grundlage der "Gesamt"-Ansicht von "Trainingsverlauf" (WeeklyVolumeChart),
    die als eigene Sportart-Tab-Ebene (nicht mehr als Sub-Ansicht innerhalb
    einer Sportart) wirklich ALLES zusammenzaehlt, inkl. distanzloser
    Einheiten (Athletik/Beweglichkeit/Krafttraining) ueber ihre Minuten.

    `activities` als Liste von (day, distance_m, duration_s)-Tupeln, damit
    die Funktion unabhaengig vom Activity-ORM-Modell bleibt und isoliert
    testbar ist. distance_m ist None bei distanzlosen Einheiten und traegt
    dann 0 km bei (aber weiterhin ihre Minuten).
    """
    totals: dict[date, tuple[float, float]] = {}
    for day, distance_m, duration_s in activities:
        monday = day - timedelta(days=day.weekday())
        km, minutes = totals.get(monday, (0.0, 0.0))
        totals[monday] = (km + (distance_m or 0) / 1000, minutes + duration_s / 60)

    return [
        WeeklyVolumePoint(week_start=week_start, km=round(km, 1), minutes=round(minutes, 1))
        for week_start, (km, minutes) in sorted(totals.items())
    ]


@dataclass(frozen=True)
class WeeklyVolumeBySportPoint:
    week_start: date
    sport: str  # "run" | "bike" | "swim"
    km: float
    minutes: float


def weekly_volume_by_sport(
    activities: list[tuple[date, float | None, float, str | None]]
) -> list[WeeklyVolumeBySportPoint]:
    """Wie `weekly_volume`, aber die Kilometer/Minuten nach Sportart (Laufen/
    Radfahren/Schwimmen) statt insgesamt aufgeteilt - fuer die Sportart-Tabs
    und den Minuten-Umschalter von "Trainingsverlauf" (WeeklyVolumeChart).
    Die Sportart wird aus der Zielzone abgeleitet
    (`training_zones.sport_of_target_zone`), da Activity kein eigenes
    Sportart-Feld hat; Einheiten ohne Zielzone tragen zu keiner Sportart bei.

    Anders als fruehere Versionen dieser Funktion werden Einheiten ohne
    Distanz NICHT mehr komplett uebersprungen - eine reine Dauer-Einheit
    (z.B. eine Radeinheit ohne GPS) traegt weiterhin 0 km, aber ihre
    tatsaechliche Dauer zu `minutes` bei, sonst wuerde sie aus dem
    minutenbasierten Trainingsverlauf komplett verschwinden.

    `activities` als Liste von (day, distance_m, duration_s, target_zone)-
    Tupeln, analog zu `weekly_volume`."""
    totals: dict[tuple[date, str], tuple[float, float]] = {}
    for day, distance_m, duration_s, target_zone in activities:
        sport = sport_of_target_zone(target_zone)
        if sport is None:
            continue
        monday = day - timedelta(days=day.weekday())
        key = (monday, sport)
        km, minutes = totals.get(key, (0.0, 0.0))
        totals[key] = (km + (distance_m or 0) / 1000, minutes + duration_s / 60)

    return [
        WeeklyVolumeBySportPoint(week_start=week_start, sport=sport, km=round(km, 1), minutes=round(minutes, 1))
        for (week_start, sport), (km, minutes) in sorted(totals.items())
    ]


@dataclass(frozen=True)
class WeeklyVolumeByZonePoint:
    week_start: date
    zone_km: dict[str, float]


def weekly_volume_by_zone(
    activities: list[tuple[date, dict[str, float]]],
) -> list[WeeklyVolumeByZonePoint]:
    """Wie `weekly_volume`, aber statt der Gesamtkilometer pro Woche die
    Kilometer pro Tempozone (GA1/Schwelle/VO2max), aus dem bei Activity-
    Erstellung/-Bearbeitung persistierten Activity.zone_km summiert
    (dieselbe Datengrundlage wie `services/training_zones.py::pace_zone_km`,
    damit beide Ansichten konsistent bleiben). Ein Neuberechnen aus
    GPS-Kilometersplits wie zuvor liesse diese Auswertung fuer manuell
    ohne Trackaufzeichnung erfasste Einheiten leer, da Activity.zone_km
    dort stattdessen aus Segmenten/Zielzone abgeleitet wird (siehe
    zone_classifier.zone_km_from_target).

    `activities` als Liste von (day, zone_km)-Tupeln, damit die Funktion
    unabhaengig vom Activity-ORM-Modell bleibt und isoliert testbar ist.
    Bewusst unabhaengig von den *aktuellen* Pacezonen des Athleten: zone_km
    wurde beim Anlegen der Activity bereits klassifiziert und persistiert,
    Aenderungen an der Zonenkonfiguration duerfen diese historischen Werte
    nicht nachtraeglich verschwinden lassen.
    """
    totals: dict[date, dict[str, float]] = {}
    for day, zone_km in activities:
        monday = day - timedelta(days=day.weekday())
        week_totals = totals.setdefault(monday, {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0})
        for zone, km in zone_km.items():
            week_totals[zone] = week_totals.get(zone, 0.0) + km

    return [
        WeeklyVolumeByZonePoint(week_start=week_start, zone_km=zone_km)
        for week_start, zone_km in sorted(totals.items())
    ]


@dataclass(frozen=True)
class PeriodStatsInput:
    day: date
    distance_m: float | None
    duration_s: float
    zone_km: dict[str, float]
    effective_vo2max: float | None
    target_zone: str | None


@dataclass(frozen=True)
class MonthStatsPoint:
    month: int  # 1-12
    avg_km_per_week: float
    pct_ga1: float | None
    pct_schwelle: float | None
    pct_vo2max: float | None
    mean_effective_vo2max: float | None
    sonstige_avg_h_per_week: float


@dataclass(frozen=True)
class YearStatsPoint:
    year: int
    avg_km_per_week: float
    pct_ga1: float | None
    pct_schwelle: float | None
    pct_vo2max: float | None
    mean_effective_vo2max: float | None
    sonstige_avg_h_per_week: float
    months: list[MonthStatsPoint]


# Ob eine Einheit als "Laufen" zaehlt, wird ueber ihre Zielzone entschieden:
# eine der drei Lauf-Pace-Zonen, ODER keine Zielzone gesetzt (aeltere/
# degenerierte Eintraege - die App war lange rein lauf-spezifisch, siehe
# services/normalizer.py:build_activity_record). Alles mit einer erkennbar
# nicht-lauf-spezifischen Zielzone (Rad/Schwimmen/Athletik/Beweglichkeit/
# Krafttraining, siehe training_zones.DURATION_ZONES) zaehlt als "Sonstige".
def _is_run(target_zone: str | None) -> bool:
    return target_zone is None or target_zone in PACE_ZONES


def _period_metrics(
    activities: list[PeriodStatsInput], period_start: date, period_end: date, today: date
) -> tuple[float, float | None, float | None, float | None, float | None, float]:
    """Berechnet die 6 Kennzahlen der Jahres-/Monatsstatistik-Tabelle
    (PeriodStatsTable.tsx) fuer einen Zeitraum [period_start, period_end).

    avg_km_per_week: NUR aus Laufaktivitaeten (siehe _is_run) - Gesamt-
    kilometer geteilt durch die Kalenderwochen im Zeitraum. Fuer den noch
    laufenden aktuellen Monat/Jahr (period_end in der Zukunft) zaehlen nur
    die bereits verstrichenen Tage, sonst wuerde der Schnitt fuer den
    aktuellen Zeitraum kuenstlich niedrig wirken (der Zeitraum ist ja noch
    nicht vorbei). Ohne diese Sonderbehandlung wuerde z.B. der laufende
    Monat am 5. Tag nur 5/30 der erwarteten Wochenzahl zeigen, obwohl der
    Athlet bis dahin ganz normal trainiert haben kann.

    pct_ga1/schwelle/vo2max: Anteil an der Summe der drei Lauf-Pace-Zonen-
    Kilometer im Zeitraum (nicht der Rad-Zonen - analog zur bestehenden
    pace_zone_km-Semantik, siehe services/training_zones.py). None ohne
    jede klassifizierte Lauf-Zonen-Distanz im Zeitraum.

    mean_effective_vo2max: Mittelwert ueber Laufaktivitaeten im Zeitraum
    (sport_of_target_zone == "run" oder None, konsistent mit dem
    Referenzleistungs-Filter in api/analytics.py). None ohne solche
    Aktivitaeten.

    sonstige_avg_h_per_week: Gesamtdauer aller NICHT-Lauf-Einheiten im
    Zeitraum (Radfahren/Schwimmen/Athletik/Beweglichkeit/Krafttraining,
    siehe DURATION_ZONES), geteilt durch dieselben Kalenderwochen wie
    avg_km_per_week oben (gleiche Teilzeitraum-Behandlung fuer den noch
    laufenden aktuellen Monat/Jahr) - ein echter Wochenschnitt in Stunden,
    vom Frontend als hh:mm dargestellt (siehe PeriodStatsTable.tsx)."""
    effective_end = min(period_end, today + timedelta(days=1)) if period_end > today else period_end
    denominator_days = max((effective_end - period_start).days, 0)
    weeks = denominator_days / 7

    run_km = sum((a.distance_m or 0) / 1000 for a in activities if _is_run(a.target_zone))
    avg_km_per_week = run_km / weeks if weeks > 0 else 0.0

    sonstige_duration_s = sum(a.duration_s for a in activities if a.target_zone in DURATION_ZONES)
    sonstige_avg_h_per_week = (sonstige_duration_s / 3600) / weeks if weeks > 0 else 0.0

    zone_totals = {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0}
    for a in activities:
        for zone in zone_totals:
            zone_totals[zone] += a.zone_km.get(zone, 0.0)
    total_zone_km = sum(zone_totals.values())
    pct_ga1 = zone_totals["GA1"] / total_zone_km * 100 if total_zone_km > 0 else None
    pct_schwelle = zone_totals["Schwelle"] / total_zone_km * 100 if total_zone_km > 0 else None
    pct_vo2max = zone_totals["VO2max"] / total_zone_km * 100 if total_zone_km > 0 else None

    run_vo2max = [
        a.effective_vo2max
        for a in activities
        if a.effective_vo2max is not None and sport_of_target_zone(a.target_zone) in (None, "run")
    ]
    mean_effective_vo2max = sum(run_vo2max) / len(run_vo2max) if run_vo2max else None

    return avg_km_per_week, pct_ga1, pct_schwelle, pct_vo2max, mean_effective_vo2max, sonstige_avg_h_per_week


def compute_period_stats(activities: list[PeriodStatsInput], today: date | None = None) -> list[YearStatsPoint]:
    """Aggregiert die Trainingshistorie eines Athleten zu einer Zeile pro
    Jahr (mit den 5 Kennzahlen aus `_period_metrics`) plus je einer Zeile
    pro Monat dieses Jahres - Datengrundlage der neuen "Trainingsjahre"-
    Tabelle (PeriodStatsTable.tsx). Bewusst unabhaengig vom Dashboard-
    Zeitraumfilter (start/end in api/analytics.py:get_analytics): die
    Tabelle zeigt immer die komplette Historie auf einmal, mit einem
    Dropdown zum Wechseln zwischen Jahres- und Monatsansicht im Frontend."""
    today = today or date.today()
    by_year: dict[int, list[PeriodStatsInput]] = {}
    for a in activities:
        by_year.setdefault(a.day.year, []).append(a)

    years: list[YearStatsPoint] = []
    for year in sorted(by_year):
        year_activities = by_year[year]
        year_start, year_end = date(year, 1, 1), date(year + 1, 1, 1)
        avg_km, pct_ga1, pct_schwelle, pct_vo2max, mean_vo2max, sonstige_h_per_week = _period_metrics(
            year_activities, year_start, year_end, today
        )

        by_month: dict[int, list[PeriodStatsInput]] = {}
        for a in year_activities:
            by_month.setdefault(a.day.month, []).append(a)

        # Immer alle 12 Monate liefern (nicht nur Monate mit Aktivitaeten) -
        # das Dropdown in PeriodStatsTable.tsx soll jeden Monat des Jahres
        # anwaehlbar machen, auch einen komplett trainingsfreien.
        months: list[MonthStatsPoint] = []
        for month in range(1, 13):
            month_start = date(year, month, 1)
            month_end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
            m_avg_km, m_pct_ga1, m_pct_schwelle, m_pct_vo2max, m_mean_vo2max, m_sonstige_h_per_week = _period_metrics(
                by_month.get(month, []), month_start, month_end, today
            )
            months.append(
                MonthStatsPoint(
                    month=month,
                    avg_km_per_week=round(m_avg_km, 1),
                    pct_ga1=round(m_pct_ga1, 1) if m_pct_ga1 is not None else None,
                    pct_schwelle=round(m_pct_schwelle, 1) if m_pct_schwelle is not None else None,
                    pct_vo2max=round(m_pct_vo2max, 1) if m_pct_vo2max is not None else None,
                    mean_effective_vo2max=round(m_mean_vo2max, 1) if m_mean_vo2max is not None else None,
                    sonstige_avg_h_per_week=round(m_sonstige_h_per_week, 2),
                )
            )

        years.append(
            YearStatsPoint(
                year=year,
                avg_km_per_week=round(avg_km, 1),
                pct_ga1=round(pct_ga1, 1) if pct_ga1 is not None else None,
                pct_schwelle=round(pct_schwelle, 1) if pct_schwelle is not None else None,
                pct_vo2max=round(pct_vo2max, 1) if pct_vo2max is not None else None,
                mean_effective_vo2max=round(mean_vo2max, 1) if mean_vo2max is not None else None,
                sonstige_avg_h_per_week=round(sonstige_h_per_week, 2),
                months=months,
            )
        )
    return years


# Standard-Wettkampfdistanzen fuer die Riegel-Hochrechnung
RACE_DISTANCES_M = {
    "5k": 5000.0,
    "10k": 10000.0,
    "half_marathon": 21097.5,
    "marathon": 42195.0,
}

# Suchbereich der Bisektion in predict_race_times_from_vdot: die untere
# Grenze deckt sich mit MIN_DURATION_S_FOR_VO2MAX (effective_vo2max liefert
# darunter None), die obere Grenze (6h) liegt fuer alle RACE_DISTANCES_M
# weit unterhalb jedes plausiblen VDOT-Werts, sodass eine Loesung garantiert
# im Suchintervall liegt.
VDOT_PREDICTION_MIN_DURATION_S = float(MIN_DURATION_S_FOR_VO2MAX)
VDOT_PREDICTION_MAX_DURATION_S = 6 * 3600.0
VDOT_PREDICTION_BISECTION_STEPS = 60


def predict_race_times_from_vdot(vdot: float | None) -> dict[str, float]:
    """Wettkampfprognose direkt aus dem eff. VO2max (VDOT, typischerweise
    der Bestwert der letzten ~90 Tage, siehe `api/analytics.py`) nach
    Daniels-Gilbert: fuer jede Zieldistanz wird per Bisektion die Dauer t
    gesucht, bei der `effective_vo2max(distanz, t)` exakt dem uebergebenen
    VDOT entspricht - die Umkehrung derselben Formel, mit der der VDOT einer
    einzelnen Trainingseinheit geschaetzt wird, sodass Graph (Eff. VO2max)
    und Prognose auf derselben Kennzahl beruhen (Daniels, J. & Gilbert, J.,
    1979: "Oxygen Power"; Daniels, J., "Daniels' Running Formula", Human
    Kinetics).

    `effective_vo2max(D, t)` faellt bei fester Distanz D streng monoton mit
    t (schnelleres Tempo -> hoeherer VO2max-Bedarf) - Bisektion konvergiert
    daher zuverlaessig auf eine eindeutige Loesung. Leeres Dict ohne
    (oder bei unplausiblem) VDOT."""
    if not vdot or vdot <= 0:
        return {}

    predictions: dict[str, float] = {}
    for label, distance_m in RACE_DISTANCES_M.items():
        fastest = effective_vo2max(distance_m, VDOT_PREDICTION_MIN_DURATION_S)
        if fastest is None or fastest < vdot:
            continue
        lo, hi = VDOT_PREDICTION_MIN_DURATION_S, VDOT_PREDICTION_MAX_DURATION_S
        for _ in range(VDOT_PREDICTION_BISECTION_STEPS):
            mid = (lo + hi) / 2
            value = effective_vo2max(distance_m, mid) or 0.0
            if value > vdot:
                lo = mid
            else:
                hi = mid
        predictions[label] = (lo + hi) / 2
    return predictions


# A:C-Workload-Ratio-Zonen nach dem "Sweet Spot"/"Danger Zone"-Modell aus
# Blanch, P. & Gabbett, T. (2016): "Has the athlete trained enough to
# return to play safely? The acute:chronic workload ratio permits
# clinicians to quantify a player's risk of subsequent injury", British
# Journal of Sports Medicine, 50(8), 471-475, doi: 10.1136/bjsports-2015-
# 095445 - dort als "sweet spot" (0.8-1.3, niedrigstes Verletzungsrisiko)
# und "danger zone" (>1.5, deutlich erhoehtes Risiko) beschrieben. Ein
# Verhaeltnis von akuter zu chronischer Last deutlich ausserhalb 0.8-1.3
# ist mit erhoehtem Verletzungsrisiko assoziiert - sowohl bei zu schnellem
# Belastungsanstieg (> 1.5) als auch bei starkem Fitnessverlust durch zu
# wenig Reiz (< 0.8). Dieselbe Einteilung findet sich auch in Gabbetts
# eigenstaendigem Uebersichtsartikel (Gabbett, T. (2016): "The
# training-injury prevention paradox: should athletes be training smarter
# and harder?", BJSM, 50(5), 273-280), der auf Blanch & Gabbett (2016)
# aufbaut.
ACWR_UNDERTRAINING = 0.8
ACWR_OPTIMAL_UPPER = 1.3
ACWR_HIGH_RISK = 1.5

# Fenstergroessen der klassischen Gabbett-ACWR: gleitender 7-Tage-Schnitt
# der Tageslast (akut) geteilt durch gleitenden 28-Tage-Schnitt (chronisch).
ACWR_ACUTE_WINDOW_DAYS = 7
ACWR_CHRONIC_WINDOW_DAYS = 28


# Relative Verletzungsrisiko-Multiplikatoren je A:C-Ratio, direkt aus der
# vom Trainer vorgegebenen Tabelle (Blanch & Gabbett 2016, Abbildung des
# Zusammenhangs ACWR -> relatives Verletzungsrisiko; Referenzwert x1.00 bei
# ACWR=0.50). Stuetzstellen im 0.25-Raster, dazwischen linear interpoliert -
# eine geschlossene Formel (z.B. eine Parabel) trifft die vorgegebenen Werte
# nicht exakt, die Tabelle selbst aber schon per Konstruktion.
RISK_MULTIPLIER_TABLE: list[tuple[float, float]] = [
    (0.00, 2.35),
    (0.25, 1.55),
    (0.50, 1.00),
    (0.75, 0.71),
    (1.00, 0.66),
    (1.25, 0.86),
    (1.50, 1.31),
    (1.75, 2.01),
    (2.00, 2.96),
    (2.25, 4.16),
    (2.50, 5.61),
]


def relative_injury_risk(acwr: float) -> float:
    """Relativer Verletzungsrisiko-Multiplikator zur A:C-Ratio, linear
    interpoliert aus RISK_MULTIPLIER_TABLE. Werte unterhalb der Tabelle
    (ACWR < 0) koennen nicht auftreten (ACWR ist nie negativ); oberhalb von
    2.50 wird mit der Steigung des letzten Tabellensegments extrapoliert,
    statt den Wert bei 5.61 zu deckeln - eine ACWR von z.B. 3.0 nach einer
    extremen Belastungsspitze soll weiterhin als (noch) hoeheres Risiko
    sichtbar bleiben."""
    table = RISK_MULTIPLIER_TABLE
    if acwr <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if acwr <= x1:
            t = (acwr - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    (x0, y0), (x1, y1) = table[-2], table[-1]
    slope = (y1 - y0) / (x1 - x0)
    return y1 + slope * (acwr - x1)


def classify_injury_risk(acwr: float) -> str:
    if acwr < ACWR_UNDERTRAINING:
        return "unterbelastung"
    if acwr <= ACWR_OPTIMAL_UPPER:
        return "optimal"
    if acwr <= ACWR_HIGH_RISK:
        return "erhoeht"
    return "hoch"


@dataclass(frozen=True)
class WorkloadRiskPoint:
    day: date
    load: float
    ctl: float
    atl: float
    tsb: float
    acwr: float
    risk: str
    # None bei "unbekannt" (keine Trainingshistorie) - siehe acwr_and_risk.
    risk_multiplier: float | None


def acwr_and_risk(pmc: list[PmcPoint]) -> list[WorkloadRiskPoint]:
    """Erweitert die vorhandene CTL/ATL-Zeitreihe (`compute_pmc`) um die
    A:C-Ratio nach Gabbett und eine Verletzungsrisiko-Einstufung pro Tag.

    Die ACWR wird bewusst NICHT aus den EWMA-basierten CTL/ATL-Werten
    genaehert (`atl/ctl`), obwohl beide Werte hier verfuegbar waeren: das
    waere eine andere Groesse als Gabbetts Original-ACWR, da CTL/ATL
    exponentiell geglaettet sind (Zeitkonstanten 42/7 Tage, siehe
    `services/training_load.py`) statt eines gleitenden Fensters, und die
    obigen Schwellenwerte (0.8/1.3/1.5) fuer die klassische Fenster-ACWR
    kalibriert sind, nicht fuer ein EWMA-Verhaeltnis. Stattdessen wird
    hier direkt aus `p.load` (der Tageslast, identisch zur Eingabe von
    `compute_pmc`) der gleitende 7-Tage-Schnitt (akut) durch den
    gleitenden 28-Tage-Schnitt (chronisch) geteilt - Gabbetts
    urspruengliche Definition. `pmc` muss dafuer lueckenlos sein (ein
    Eintrag pro Kalendertag, siehe `fill_missing_days`), sonst wuerden
    Trainingspausen die Fenster verzerren.

    Beide Fenster nutzen bewusst so viele Tage wie tatsaechlich verfuegbar
    sind (max. 7 bzw. 28), statt ein vollstaendiges 28-Tage-Fenster zu
    verlangen: ein starres Minimum wuerde bei jedem Athleten mit unter 4
    Wochen Historie (z.B. neu angelegte Accounts) dauerhaft eine ACWR von 0
    erzwingen. Die anfaenglich kleinere Stichprobe ist weniger belastbar,
    aber ein grober Richtwert ist ab dem ersten Trainingstag nuetzlicher als
    wochenlang gar keiner - ab einem vollen 28-Tage-Fenster ist das Ergebnis
    identisch zur bisherigen Berechnung.
    """
    loads = [p.load for p in pmc]
    points = []
    for i, p in enumerate(pmc):
        chronic_window = loads[max(0, i - ACWR_CHRONIC_WINDOW_DAYS + 1) : i + 1]
        acute_window = loads[max(0, i - ACWR_ACUTE_WINDOW_DAYS + 1) : i + 1]
        chronic_avg = sum(chronic_window) / len(chronic_window)
        acute_avg = sum(acute_window) / len(acute_window)
        acwr = acute_avg / chronic_avg if chronic_avg > 0 else 0.0

        if chronic_avg == 0 and acute_avg == 0:
            # Buchstaeblich keine Trainingshistorie: ACWR nicht aussagekraeftig.
            risk = "unbekannt"
        elif chronic_avg == 0 and acute_avg > 0:
            # Belastungsspitze ohne jede chronische Basis (z.B. Wiedereinstieg
            # nach laengerer Pause) ist gerade der klassische Gabbett-Fall mit
            # dem hoechsten Verletzungsrisiko - nicht "unbekannt".
            risk = "hoch"
        else:
            risk = classify_injury_risk(acwr)

        points.append(
            WorkloadRiskPoint(
                day=p.day,
                load=p.load,
                ctl=p.ctl,
                atl=p.atl,
                tsb=p.tsb,
                acwr=acwr,
                risk=risk,
                risk_multiplier=relative_injury_risk(acwr) if risk != "unbekannt" else None,
            )
        )
    return points
