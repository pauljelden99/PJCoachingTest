"""
Klassifizierung von Trainingskilometern in Intensitaetszonen
(GA1 / Schwelle / VO2max) auf Basis der Pace pro Kilometer.

Die Zonengrenzen sind athletenspezifisch und daher NICHT fest im Code
verdrahtet, sondern werden aus Feldtests oder aktuellen Wettkampfzeiten
abgeleitet und im Athletenprofil gespeichert (siehe `PaceZones`). Das
Verhaeltnis zwischen Schwellenpace und VO2max-Pace unterscheidet sich
je nach Athlet und Trainingsstand zu stark, um es als Konstante
anzunehmen.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PaceZones:
    """Zonengrenzen in Sekunden pro Kilometer (kleinerer Wert = schneller).

    threshold_pace_sec_per_km: Pace an der (anaeroben) Schwelle, z.B.
        aus einem Laktat-Feldtest oder einer aktuellen 10-15km-Zeit.
    vo2max_pace_sec_per_km: Pace bei VO2max-Belastung, z.B. aus einer
        aktuellen 3-5km-Bestzeit.
    """

    threshold_pace_sec_per_km: float
    vo2max_pace_sec_per_km: float
    # Pace bei 3 mmol/l Laktat (vLT3, aus der Laktat-Leistungsdiagnostik -
    # User.vlt3_pace_sec_per_km), Referenzgeschwindigkeit der kontinuierlichen
    # Lastformel (training_load.py:load_from_velocity_samples). Optional, da
    # nicht jeder Athlet einen Laktatstufentest hat - None faellt in
    # v_lt3_mps auf threshold_pace_sec_per_km zurueck.
    vlt3_pace_sec_per_km: float | None = None

    def __post_init__(self) -> None:
        if self.vo2max_pace_sec_per_km >= self.threshold_pace_sec_per_km:
            raise ValueError(
                "vo2max_pace_sec_per_km muss schneller (kleiner) als "
                "threshold_pace_sec_per_km sein"
            )

    @property
    def v_lt3_mps(self) -> float:
        """Geschwindigkeit an der Schwelle (vLT3) in m/s fuer die
        kontinuierliche Lastformel (training_load.py:
        load_from_velocity_samples)."""
        pace = self.vlt3_pace_sec_per_km or self.threshold_pace_sec_per_km
        return pace_to_velocity_mps(pace)

    @property
    def ga1_upper_bound(self) -> float:
        """Langsamste Pace-Grenze der Schwellenzone (Uebergang zu GA1).
        Default: 6% langsamer als die Schwellenpace - als Coach direkt
        anpassbar, falls du eine andere Bandbreite bevorzugst."""
        return self.threshold_pace_sec_per_km * 1.06

    @property
    def vo2max_lower_bound(self) -> float:
        """Schnellste Pace-Grenze der Schwellenzone (Uebergang zu
        VO2max). Default: Mittelpunkt zwischen Schwelle und VO2max."""
        gap = self.threshold_pace_sec_per_km - self.vo2max_pace_sec_per_km
        return self.threshold_pace_sec_per_km - gap * 0.5


@dataclass(frozen=True)
class Split:
    distance_km: float
    duration_s: float

    @property
    def pace_sec_per_km(self) -> float:
        if self.distance_km <= 0:
            raise ValueError("distance_km muss > 0 sein")
        return self.duration_s / self.distance_km


def pace_to_velocity_mps(pace_sec_per_km: float) -> float:
    """Rechnet eine Pace (Sekunden/km) in eine Geschwindigkeit (m/s) um -
    Kehrwert-Umrechnung fuer die kontinuierliche Lastformel
    (training_load.py:load_from_velocity_samples), die mit Geschwindigkeit
    statt Pace rechnet (eine groessere Geschwindigkeit = schnelleres
    Laufen, waehrend eine kleinere Pace schnelleres Laufen bedeutet)."""
    return 1000 / pace_sec_per_km


def zone_reference_velocity_mps(zone: str, zones: PaceZones) -> float:
    """Repraesentative Geschwindigkeit einer Pace-Zone fuer die
    kontinuierliche Lastformel, wenn keine echte Zeitreihe vorliegt (nur
    eine grobe Zonen-Verteilung, siehe normalizer.py:build_activity_record) -
    GA1 an der langsamsten Schwellenzonen-Grenze, Schwelle exakt an
    threshold_pace_sec_per_km, VO2max an vo2max_pace_sec_per_km."""
    if zone == "GA1":
        pace = zones.ga1_upper_bound
    elif zone == "Schwelle":
        pace = zones.threshold_pace_sec_per_km
    elif zone == "VO2max":
        pace = zones.vo2max_pace_sec_per_km
    else:
        raise ValueError(f"Unbekannte Zone: {zone}")
    return pace_to_velocity_mps(pace)


def classify_split(split: Split, zones: PaceZones) -> str:
    pace = split.pace_sec_per_km
    if pace >= zones.ga1_upper_bound:
        return "GA1"
    if pace <= zones.vo2max_lower_bound:
        return "VO2max"
    return "Schwelle"


def classify_distance(splits: list[Split], zones: PaceZones) -> dict[str, float]:
    """Summiert die gelaufenen Kilometer pro Zone - Grundlage fuer z.B.
    eine Wochenuebersicht 'X km GA1, Y km Schwelle, Z km VO2max' oder
    ein Tortendiagramm im Dashboard."""
    totals = {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0}
    for split in splits:
        zone = classify_split(split, zones)
        totals[zone] += split.distance_km
    return {zone: round(km, 1) for zone, km in totals.items()}


def classify_duration(splits: list[Split], zones: PaceZones) -> dict[str, float]:
    """Summiert die trainierte Zeit (in Minuten) pro Zone - Pendant zu
    `classify_distance`, Grundlage fuer die Zeit-in-Zone-Auswertung auf
    der Trainingszonen-Unterseite (app/services/training_zones.py)."""
    totals = {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0}
    for split in splits:
        zone = classify_split(split, zones)
        totals[zone] += split.duration_s / 60
    return totals


def _parse_pace_sec_per_km(pace: str | None) -> float | None:
    """Parst ein "mm:ss"-Tempo (siehe PlanSegment.pace) in Sekunden/km -
    Pendant zu parsePaceValue() im Frontend (lib/pace.ts), das dieselbe
    Umrechnung fuer segmentDistanceKm() (lib/plan.ts) nutzt."""
    if not pace or ":" not in pace:
        return None
    minutes_str, _, seconds_str = pace.partition(":")
    try:
        minutes = int(minutes_str)
        seconds = int(seconds_str)
    except ValueError:
        return None
    total = minutes * 60 + seconds
    return total if total > 0 else None


def _segment_distance_km(segment: dict) -> float:
    """Distanz eines Segments in km, inkl. Wiederholungen - fuer
    Minutenintervalle (duration_s statt distance_km, z.B. "4x 3min
    Schwelle") aus Dauer und Tempo abgeleitet, exakt wie segmentDistanceKm()
    im Frontend (lib/plan.ts). Ohne diese Ableitung wuerden Schwellen-/
    VO2max-Minutenintervalle mit 0 km in zone_km_from_target() eingehen -
    sie wurden zwar im Frontend korrekt in die Gesamtdistanz eingerechnet,
    tauchten aber nicht in Activity.zone_km und damit nicht in den
    Zonen-Auswertungen/Graphen auf."""
    repeat = segment.get("repeat") or 1
    distance_km = segment.get("distance_km")
    if distance_km:
        return distance_km * repeat
    duration_s = segment.get("duration_s")
    if duration_s:
        pace_sec_per_km = _parse_pace_sec_per_km(segment.get("pace"))
        if pace_sec_per_km:
            return (duration_s / pace_sec_per_km) * repeat
    return 0.0


def segment_velocity_and_duration_s(segment: dict) -> tuple[float, float] | None:
    """Geschwindigkeit (m/s) und Dauer (s) einer EINZELNEN Wiederholung
    eines Segments (repeat wird bewusst NICHT hier angewandt, sondern von
    der aufrufenden Segment-Abwaelzung - siehe expand_segment_reps unten).

    Distanz und Dauer sind in einem PlanSegment (siehe schemas/
    training_plan.py) ueblicherweise gegenseitig exklusiv gesetzt (nur
    eines von beiden, siehe frontend/src/components/SegmentEditor.tsx),
    daher wird das jeweils fehlende ueber `pace` (mm:ss/km) abgeleitet -
    None, wenn sich weder beides direkt noch ueber ein parsebares Tempo
    bestimmen laesst."""
    duration_s = segment.get("duration_s")
    distance_km = segment.get("distance_km")
    pace_sec_per_km = _parse_pace_sec_per_km(segment.get("pace"))

    if distance_km and duration_s:
        return (distance_km * 1000) / duration_s, duration_s
    if duration_s and pace_sec_per_km:
        return pace_to_velocity_mps(pace_sec_per_km), duration_s
    if distance_km and pace_sec_per_km:
        return pace_to_velocity_mps(pace_sec_per_km), distance_km * pace_sec_per_km
    return None


def expand_segment_reps(segments: list[dict]) -> list[tuple[float, float]]:
    """Waelzt eine Segmentliste (Activity.segments) in eine flache,
    chronologische Folge von (Geschwindigkeit m/s, Dauer s) je einzelner
    Wiederholung ab - Grundlage fuer den D'-Balance-Extra-Term
    (training_load.py:w_prime_balance_extra_load), der Tempo und Dauer
    jeder einzelnen Belastungs-/Pausenwiederholung braucht statt nur der
    (fuer die Zonenverteilung ausreichenden) Durchschnittswerte je Segment.

    Ein "interval"-Segment mit repeat=N wird zu N Wiederholungen; folgt
    direkt danach ein "jog_recovery"/"rest"-Segment, gilt dessen Tempo/
    Dauer als die Pause ZWISCHEN den N Wiederholungen (N-1 mal, wie bei
    einer echten Intervalleinheit - nach der letzten Wiederholung folgt
    keine weitere Trainingspause mehr) und wird nicht zusaetzlich an
    seiner eigenen Listenposition gezaehlt. Alle anderen Segmente (warmup,
    steady, cooldown, oder ein "rest" ohne vorausgehendes "interval")
    tragen einfach repeat-mal ihre eigene Dauer bei. Segmente ohne
    bestimmbare Geschwindigkeit/Dauer (siehe segment_velocity_and_duration_s)
    werden ausgelassen."""
    reps: list[tuple[float, float]] = []
    consumed_as_recovery: set[int] = set()

    for i, segment in enumerate(segments):
        if i in consumed_as_recovery:
            continue
        repeat = segment.get("repeat") or 1
        vd = segment_velocity_and_duration_s(segment)

        if segment.get("type") == "interval":
            recovery_vd = None
            if i + 1 < len(segments) and segments[i + 1].get("type") in ("jog_recovery", "rest"):
                recovery_vd = segment_velocity_and_duration_s(segments[i + 1])
                consumed_as_recovery.add(i + 1)
            for rep in range(repeat):
                if vd is not None:
                    reps.append(vd)
                if recovery_vd is not None and rep < repeat - 1:
                    reps.append(recovery_vd)
        elif vd is not None:
            reps.extend([vd] * repeat)

    return reps


def zone_km_from_target(
    distance_m: float | None, target_zone: str | None, segments: list[dict] | None
) -> dict[str, float]:
    """Grobe Zonen-Einteilung ohne GPS-Kilometersplits - fuer manuell ohne
    Trackaufzeichnung erfasste Einheiten (siehe services/normalizer.py),
    bei denen `classify_distance` mangels Splits nichts liefert und
    Activity.zone_km sonst immer leer bliebe (die Zonen-Auswertungen
    "Kilometer/Zeit pro Woche/Zone" zeigten dann faktisch nichts an).

    Segmente (strukturierte Schwelle-/VO2max-Einheiten, siehe
    PlanSegment) haben Vorrang, da sie bereits pro Abschnitt eine Zone +
    Distanz tragen (z.B. Aufwaermen=GA1, Intervall=Schwelle). Ohne
    brauchbare Segmente zaehlt die gesamte Distanz zur gewaehlten
    Zielzone (target_zone) der Einheit. Liefert ein leeres dict, wenn
    sich keine Zone/Distanz ableiten laesst (z.B. Athletik/Beweglichkeit
    ohne Distanzbezug) - `build_activity_record` liefert dann daily_load=0,
    statt einen falschen Nullwert je Zone anzunehmen."""
    totals: dict[str, float] = {}
    for segment in segments or []:
        zone = segment.get("zone")
        km = _segment_distance_km(segment)
        if zone in ("GA1", "Schwelle", "VO2max", "Sprint/Reps") and km:
            totals[zone] = totals.get(zone, 0.0) + km
    if totals:
        return {zone: round(km, 1) for zone, km in totals.items()}
    if target_zone in ("GA1", "Schwelle", "VO2max", "Sprint/Reps") and distance_m:
        return {target_zone: round(distance_m / 1000, 1)}
    return {}
