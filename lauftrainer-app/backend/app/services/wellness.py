"""
Baseline-Berechnung fuer die taeglichen Wellness-Werte (Ruhepuls, HRV,
Schlafdauer, Schlafqualitaet): fuer jeden Tag im angefragten Zeitraum wird
aus den vorangegangenen 30 Tagen (inkl. des Tages selbst) ein Mittelwert
sowie ein 90%-Band gebildet, damit das Dashboard den Tageswert direkt vor
diesem Hintergrund einordnen kann ("ist das heute ungewoehnlich?").

Das Band beschreibt bewusst die Streuung der Einzelwerte in den letzten 30
Tagen (mean +/- 1.645 * Populations-Standardabweichung), nicht die
Praezision des Mittelwerts selbst (das waere ein deutlich schmaleres
Konfidenzintervall der Mittelwertschaetzung, z.B. mean +/- 1.645 *
Standardfehler). Die Streuungs-Variante ist hier die richtige Lesart, weil
das Band als Referenzbereich fuer den einzelnen Tageswert dienen soll, nicht
als Unsicherheitsangabe ueber den 30-Tage-Mittelwert. Verwendet die
Normalapproximation (z=1.645 fuer 90%) statt einer t-Verteilung, da im
Projekt keine scipy-Abhaengigkeit vorhanden ist (siehe requirements.txt).

Reine Funktion (kein DB-Zugriff), analog zu services/training_zones.py -
die DB-Anbindung passiert in app/api/wellness.py.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date, timedelta

from app.schemas.daily_wellness import WellnessBaselinePoint

BASELINE_WINDOW_DAYS = 30
MIN_BASELINE_POINTS = 5
Z_90 = 1.645


@dataclass(frozen=True)
class WellnessEntryInput:
    day: date
    value: float | None


def compute_baseline_series(
    entries: list[WellnessEntryInput],
    range_start: date,
    range_end: date,
) -> list[WellnessBaselinePoint]:
    """Ein Punkt pro Tag in [range_start, range_end) (Ende exklusiv, wie bei
    den uebrigen Zeitraum-Endpunkten des Projekts). `entries` sollte auch
    die BASELINE_WINDOW_DAYS Tage vor range_start enthalten, sonst ist die
    Baseline am Anfang des Fensters kuenstlich duenn."""
    by_day = {e.day: e.value for e in entries if e.value is not None}

    points: list[WellnessBaselinePoint] = []
    day = range_start
    while day < range_end:
        window_start = day - timedelta(days=BASELINE_WINDOW_DAYS - 1)
        window_values = [v for d, v in by_day.items() if window_start <= d <= day]

        baseline_mean = baseline_lower = baseline_upper = None
        if len(window_values) >= MIN_BASELINE_POINTS:
            mean = statistics.fmean(window_values)
            stddev = statistics.pstdev(window_values)
            baseline_mean = round(mean, 2)
            baseline_lower = round(mean - Z_90 * stddev, 2)
            baseline_upper = round(mean + Z_90 * stddev, 2)

        points.append(
            WellnessBaselinePoint(
                day=day,
                value=by_day.get(day),
                baseline_mean=baseline_mean,
                baseline_lower=baseline_lower,
                baseline_upper=baseline_upper,
            )
        )
        day += timedelta(days=1)

    return points
