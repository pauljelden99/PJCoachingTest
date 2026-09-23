"""
Klassifizierung von Radeinheiten in Intensitaetszonen
(GA1 / Schwelle / VO2max) auf Basis der Leistung in Watt.

Analog zu services/zone_classifier.py:PaceZones, aber mit umgekehrter
Richtung: bei Pace ist ein KLEINERER Wert eine hoehere Intensitaet, bei
Watt ist ein GROESSERER Wert eine hoehere Intensitaet. Die Zonengrenzen
werden als Prozentsatz der Schwellenleistung (FTP, functional threshold
power) abgeleitet - anders als bei Pace gibt es dafuer keine athleten-
individuelle Ableitung aus Wettkampfzeiten, FTP wird direkt eingetragen
(siehe models/user.py:ftp_watts).
"""

from dataclasses import dataclass

# Standard-Trainingsbereichs-Konvention (Coggan-Zonen, hier auf die 3
# App-weiten Zonen GA1/Schwelle/VO2max komprimiert, analog zur
# GA1/Schwelle/VO2max-Einteilung beim Laufen). FTP selbst (100%) liegt
# mittig in der Schwellenzone, wie beim Laufen die Schwellenpace.
GA1_UPPER_FTP_PCT = 0.75
VO2MAX_LOWER_FTP_PCT = 1.05


@dataclass(frozen=True)
class WattZones:
    """Zonengrenzen in Watt (groesserer Wert = intensiver - umgekehrt zu
    PaceZones!).

    ftp_watts: Schwellenleistung (FTP), z.B. aus einem Rad-Stufentest oder
        einer 20-60min-Bestleistung.
    """

    ftp_watts: float

    @property
    def ga1_upper_bound(self) -> float:
        """Hoechste Watt-Grenze der GA1-Zone (Uebergang zur Schwellenzone)."""
        return self.ftp_watts * GA1_UPPER_FTP_PCT

    @property
    def vo2max_lower_bound(self) -> float:
        """Niedrigste Watt-Grenze der VO2max-Zone (Uebergang von der
        Schwellenzone)."""
        return self.ftp_watts * VO2MAX_LOWER_FTP_PCT


def classify_watts(avg_watts: float, zones: WattZones) -> str:
    if avg_watts < zones.ga1_upper_bound:
        return "GA1"
    if avg_watts >= zones.vo2max_lower_bound:
        return "VO2max"
    return "Schwelle"
