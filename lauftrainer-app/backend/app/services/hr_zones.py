"""
Herzfrequenz-Zonen nach der Karvonen-Methode (%HFR - Herzfrequenzreserve),
dieselbe HFR-Fraktion, die auch die TRIMP-Berechnung in
services/training_load.py nutzt. Gaengiges 5-Zonen-Modell im Ausdauersport.

Einschraenkung: Es wird pro Trainingseinheit nur ein Durchschnittspuls
gespeichert (Activity.avg_hr), keine sekundengenaue HF-Zeitreihe. Die
Zeit-in-HF-Zone-Auswertung (services/training_zones.py) ordnet daher jede
Einheit als Ganzes einer Zone zu (basierend auf ihrem Durchschnittspuls),
statt sie innerhalb der Einheit zeitlich aufzuteilen.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class HrZones:
    hr_rest: float
    hr_max: float

    def __post_init__(self) -> None:
        if self.hr_max <= self.hr_rest:
            raise ValueError("hr_max muss groesser als hr_rest sein")

    def hrr_fraction(self, hr: float) -> float:
        """Anteil der Herzfrequenzreserve (Karvonen), z.B. 0.75 = 75% HFR."""
        return (hr - self.hr_rest) / (self.hr_max - self.hr_rest)


# Obere %HFR-Grenze je Zone (gaengiges 5-Zonen-Modell). Die letzte Zone
# faengt alles >90% HFR auf (obere Grenze bewusst offen).
ZONE_BOUNDS: list[tuple[str, float]] = [
    ("Z1 Erholung", 0.60),
    ("Z2 Grundlage", 0.70),
    ("Z3 Entwicklung", 0.80),
    ("Z4 Schwelle", 0.90),
    ("Z5 Maximal", float("inf")),
]


def classify_hr(avg_hr: float, zones: HrZones) -> str:
    frac = zones.hrr_fraction(avg_hr)
    for label, upper in ZONE_BOUNDS:
        if frac < upper:
            return label
    return ZONE_BOUNDS[-1][0]


# Grenzen des vereinfachten 3-Stufen-Mappings (siehe classify_hr_intensity)
# in %HFR.
GA1_UPPER_HRR = 0.80
SCHWELLE_UPPER_HRR = 0.90


def classify_hr_intensity(avg_hr: float, zones: HrZones) -> str:
    """Vereinfachtes 3-Stufen-Mapping (GA1/Schwelle/VO2max) fuer Rad-/
    Schwimmeinheiten: fuer diese Sportarten gibt es - anders als beim
    Laufen - keine athletenspezifische Pace-Kalibrierung (services/
    training_zones.py:DURATION_ZONES-Kommentar), daher wird die grobe
    Intensitaetsstufe stattdessen aus der Herzfrequenzreserve abgeleitet.
    Grenzen bewusst grober als das 5-Zonen-Modell (ZONE_BOUNDS) oben, da nur
    3 Stufen ("Radfahren (GA1)"/"(Schwelle)"/"(VO2max)", siehe
    lib/plan.ts:CYCLING_ZONES/SWIMMING_ZONES) benoetigt werden."""
    frac = zones.hrr_fraction(avg_hr)
    if frac < GA1_UPPER_HRR:
        return "GA1"
    if frac < SCHWELLE_UPPER_HRR:
        return "Schwelle"
    return "VO2max"
