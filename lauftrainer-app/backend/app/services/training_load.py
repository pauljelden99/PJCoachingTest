"""
Trainingslast-Berechnung nach dem Performance-Management-Modell
(Acute/Chronic Training Load, wie z.B. bei TrainingPeaks' PMC-Chart).

CTL (Chronic Training Load) = "Fitness": exponentiell gewichteter
gleitender Durchschnitt der taeglichen Trainingslast ueber ~42 Tage.

ATL (Acute Training Load) = "Fatigue": derselbe Ansatz ueber ~7 Tage.

TSB (Training Stress Balance) = "Form" = CTL - ATL.

Die taegliche Trainingslast (`daily_load`) ist bewusst ein einzelner,
quellenunabhaengiger Skalar (vergleichbar mit TSS). Sie kann aus
HF-Daten (TRIMP) oder aus der Pace (kontinuierliche Kostenfunktion um
vLT3, siehe load_from_velocity_samples) berechnet werden, ergaenzt um
einen optionalen Extra-Term oberhalb der Critical Speed aus dem
D'-Balance-Modell (siehe w_prime_balance_extra_load). Bei Laeufen mit
hinterlegten Hoehenmetern wird die eingehende Geschwindigkeit zuerst per
Minetti-Laufkostenmodell auf eine Grade Adjusted Pace umgerechnet (siehe
grade_adjustment_factor), damit bergige Einheiten nicht systematisch
unterbewertet werden. Diese Normalisierung passiert in
app/services/normalizer.py.
"""

from dataclasses import dataclass
from datetime import date, timedelta
import math

CTL_TIME_CONSTANT_DAYS = 42
ATL_TIME_CONSTANT_DAYS = 7


@dataclass(frozen=True)
class DailyLoadPoint:
    day: date
    load: float


@dataclass(frozen=True)
class PmcPoint:
    day: date
    load: float
    ctl: float
    atl: float

    @property
    def tsb(self) -> float:
        return self.ctl - self.atl


def fill_missing_days(daily_loads: list[DailyLoadPoint]) -> list[DailyLoadPoint]:
    """Fuellt Luecken zwischen dem ersten und letzten Tag mit load=0 auf.

    Die EWMA-Formel unten braucht fuer jeden Kalendertag genau einen
    Eintrag - sonst wuerden Trainingspausen die CTL/ATL-Berechnung
    verzerren (ein Ruhetag muss als "load=0", nicht als fehlender Tag,
    in die Reihe eingehen).
    """
    if not daily_loads:
        return []

    by_day: dict[date, float] = {}
    for point in daily_loads:
        by_day[point.day] = by_day.get(point.day, 0.0) + point.load

    start, end = min(by_day), max(by_day)
    filled = []
    current = start
    while current <= end:
        filled.append(DailyLoadPoint(day=current, load=by_day.get(current, 0.0)))
        current += timedelta(days=1)
    return filled


def compute_pmc(
    daily_loads: list[DailyLoadPoint],
    start_ctl: float = 0.0,
    start_atl: float = 0.0,
) -> list[PmcPoint]:
    """Berechnet die taegliche CTL/ATL/TSB-Zeitreihe.

    Erwartet eine lueckenlose Liste (ein Eintrag pro Kalendertag) -
    siehe `fill_missing_days`. `start_ctl`/`start_atl` erlauben es,
    eine bereits bestehende Trainingshistorie fortzusetzen, statt
    immer bei 0 anzufangen.
    """
    points: list[PmcPoint] = []
    ctl, atl = start_ctl, start_atl

    for entry in daily_loads:
        ctl = ctl + (entry.load - ctl) / CTL_TIME_CONSTANT_DAYS
        atl = atl + (entry.load - atl) / ATL_TIME_CONSTANT_DAYS
        points.append(PmcPoint(day=entry.day, load=entry.load, ctl=ctl, atl=atl))

    return points


def latest_pmc(daily_loads: list[DailyLoadPoint]) -> PmcPoint | None:
    """Nur der LETZTE Punkt der CTL/ATL-Reihe, ohne die komplette
    Zeitreihe zu materialisieren - fuer Aufrufer, die ausschliesslich den
    aktuellen Fitness-/Fatigue-/Form-Stand brauchen (Athletenuebersicht des
    Trainers, siehe api/trainer.py:list_athletes) und nicht den Verlauf.

    Ergebnisgleich zu ``compute_pmc(fill_missing_days(daily_loads))[-1]``,
    aber ohne pro Kalendertag ein Zwischenobjekt anzulegen: trainingsfreie
    Luecken klingen hier in geschlossener Form ab (bei load=0 ist
    ``x_{t+1} = x_t * (1 - 1/tau)``, also nach `n` Ruhetagen
    ``x * (1 - 1/tau)^n``) statt Tag fuer Tag. Die Laufzeit haengt damit
    an der Zahl der Trainingstage, nicht an der Laenge der Historie.

    None bei leerer Eingabe (analog zum leeren Ergebnis von compute_pmc).
    """
    if not daily_loads:
        return None

    by_day: dict[date, float] = {}
    for point in daily_loads:
        by_day[point.day] = by_day.get(point.day, 0.0) + point.load

    ctl_decay = 1 - 1 / CTL_TIME_CONSTANT_DAYS
    atl_decay = 1 - 1 / ATL_TIME_CONSTANT_DAYS

    ctl = atl = 0.0
    previous: date | None = None
    for day in sorted(by_day):
        if previous is not None:
            rest_days = (day - previous).days - 1
            if rest_days > 0:
                ctl *= ctl_decay**rest_days
                atl *= atl_decay**rest_days
        load = by_day[day]
        ctl += (load - ctl) / CTL_TIME_CONSTANT_DAYS
        atl += (load - atl) / ATL_TIME_CONSTANT_DAYS
        previous = day

    assert previous is not None  # by_day ist nicht leer (s.o.)
    return PmcPoint(day=previous, load=by_day[previous], ctl=ctl, atl=atl)


# ---------------------------------------------------------------------------
# Verschiedene Wege, an einen `daily_load`-Wert zu kommen
# ---------------------------------------------------------------------------

def load_from_hr_trimp(
    duration_min: float,
    avg_hr: float,
    hr_rest: float,
    hr_max: float,
    is_female: bool = False,
    exponent_factor: float | None = None,
    weight_factor: float | None = None,
) -> float:
    """Banister-TRIMP auf Basis der Herzfrequenz (Morton et al. 1990).

    Genutzt, wenn eine Einheit Pulsdaten aber keine athletenspezifische
    Pace-Kalibrierung hat (siehe services/normalizer.py:build_activity_record).

    `exponent_factor`/`weight_factor` ueberschreiben die geschlechts-
    spezifischen Standardkonstanten (y=1.92/Gewicht=0.64 fuer Maenner,
    y=1.67/Gewicht=0.86 fuer Frauen) - so kann ein Trainer die Formel
    pro Athlet manuell kalibrieren (siehe User.trimp_exponent_factor/
    trimp_weight_factor, schemas/user.py:UserProfileUpdate), falls die
    Standardwerte fuer einen bestimmten Athleten unplausible Lastwerte
    liefern. None (Default) nutzt weiterhin die Standardkonstanten.
    """
    if hr_max <= hr_rest:
        raise ValueError("hr_max muss groesser als hr_rest sein")

    hr_reserve_frac = max(0.0, min(1.0, (avg_hr - hr_rest) / (hr_max - hr_rest)))
    y = exponent_factor if exponent_factor is not None else (1.67 if is_female else 1.92)
    weight = weight_factor if weight_factor is not None else (0.86 if is_female else 0.64)
    return duration_min * hr_reserve_frac * weight * math.exp(y * hr_reserve_frac)


# ---------------------------------------------------------------------------
# Grade Adjusted Pace (Minetti-Laufkostenmodell)
# ---------------------------------------------------------------------------

# Koeffizienten des Laufkosten-Polynoms Cr(i) [J/kg/m] fuer die Steigung i
# (Bruchteil, z.B. 0.1 = 10%) nach Minetti et al. (2002, "Energy cost of
# walking and running at extreme uphill and downhill slopes").
_MINETTI_COEFFICIENTS = (155.4, -30.4, -43.3, 46.3, 19.5, 3.6)  # i^5 .. i^0

# Das Polynom ist nur im von Minetti et al. vermessenen Laufband-Bereich
# (bis ca. +-45%) gueltig und divergiert ausserhalb davon unplausibel -
# Steigungen darueber werden daher geclampt.
GRADE_CLAMP = 0.45


def minetti_running_cost(gradient: float) -> float:
    """Energiekosten des Laufens Cr(i) in J/kg/m nach dem Minetti-Polynom,
    fuer eine auf +-GRADE_CLAMP begrenzte Steigung i (Bruchteil, nicht
    Prozent - z.B. 0.1 fuer 10%)."""
    i = max(-GRADE_CLAMP, min(GRADE_CLAMP, gradient))
    c5, c4, c3, c2, c1, c0 = _MINETTI_COEFFICIENTS
    return c5 * i**5 + c4 * i**4 + c3 * i**3 + c2 * i**2 + c1 * i + c0


_MINETTI_FLAT_COST_J_PER_KG_M = minetti_running_cost(0.0)


def grade_adjustment_factor(elevation_gain_m: float | None, distance_m: float | None) -> float:
    """Faktor, um eine gemessene Durchschnittsgeschwindigkeit in eine Grade
    Adjusted Pace (GAP) umzurechnen: v_GAP = v_gemessen * Faktor - dieselbe
    metabolische Kostenrechnung, mit der z.B. Strava/TrainingPeaks GAP
    bestimmen, hier nach dem Minetti-Laufkostenmodell.

    Da eine Aktivitaet nur die GESAMTEN Hoehenmeter traegt (keine
    Hoehenprofil-Zeitreihe, siehe Activity.elevation_gain_m), wird eine ueber
    die gesamte Distanz konstante mittlere Steigung angenommen (Hoehenmeter /
    Distanz) - eine grobe, aber ohne Streckenprofil bestmoegliche Naeherung.
    Der Faktor ist das Verhaeltnis der Laufkosten bei dieser Steigung zu den
    Laufkosten in der Ebene (minetti_running_cost): > 1 bergauf, da dieselbe
    gelaufene Pace metabolisch einer schnelleren ebenen Pace entspricht.
    1.0 (keine Anpassung) ohne Hoehenmeter oder Distanz."""
    if not elevation_gain_m or not distance_m or elevation_gain_m <= 0 or distance_m <= 0:
        return 1.0
    gradient = elevation_gain_m / distance_m
    return minetti_running_cost(gradient) / _MINETTI_FLAT_COST_J_PER_KG_M


# Kontinuierliche Pace-Kostenfunktion: Last = Summe( Minuten(v) * (v/vLT3)^K )
# mit einem EINZELNEN Kostenexponenten K (kein v-abhaengiger Uebergang mehr -
# der bisherige K0/DeltaK/alpha-Sigmoidansatz wurde durch K + den separaten
# D'-Balance-Extra-Term oberhalb der Critical Speed ersetzt, siehe unten).
# K wird automatisch aus dem Riegel-Koeffizienten b bestimmt (siehe
# riegel_exponent/k_from_riegel_exponent/resolve_load_k), individuell pro
# Athlet ueberschreibbar (User.load_k, schemas/user.py:UserProfileUpdate).
LOAD_K_MIN = 2.0
LOAD_K_MAX = 3.0
# Fallback, wenn sich der Riegel-Koeffizient mangels ausreichender Bestzeiten
# nicht berechnen laesst (riegel_exponent gibt dann None zurueck) - Mittelwert
# des K-Bereichs, keine Annahme in eine Richtung.
LOAD_K_DEFAULT = (LOAD_K_MIN + LOAD_K_MAX) / 2

# Empirischer Bereich des Riegel-Koeffizienten b bei trainierten Laeufern
# (~1.06 bei sehr guter Ausdauer/geringem Zeitverlust ueber laengere
# Distanzen, bis ~1.15 bei eher geschwindigkeitsbetonten Athleten).
# b <= RIEGEL_B_LOW_ENDURANCE -> K = LOAD_K_MAX (bessere Ausdauer -> teurerer
# Exponent), b >= RIEGEL_B_HIGH_SPEED -> K = LOAD_K_MIN, dazwischen linear.
RIEGEL_B_LOW_ENDURANCE = 1.06
RIEGEL_B_HIGH_SPEED = 1.15

# Wettkampfdistanzen in Metern je User-Zeitfeld (siehe models/user.py).
RACE_DISTANCES_M = {
    "race_100m_time_s": 100,
    "race_400m_time_s": 400,
    "race_800m_time_s": 800,
    "race_1500m_time_s": 1500,
    "race_5k_time_s": 5000,
    "race_10k_time_s": 10000,
    "race_hm_time_s": 21097.5,
    "race_marathon_time_s": 42195,
}
RACE_TIME_FIELDS = tuple(RACE_DISTANCES_M.keys())

# Nur Bestzeiten zwischen 800m und 5000m fliessen ins Critical-Speed-
# 2-Parameter-Modell ein (critical_speed_model) - kuerzere Distanzen sind zu
# anaerob-lastig (verzerren CS/D' nach oben), laengere zu aerob-dominiert
# (das lineare Distanz-Zeit-Modell passt dort nicht mehr gut).
CS_MODEL_DISTANCES_M = {field: d for field, d in RACE_DISTANCES_M.items() if 800 <= d <= 5000}

# Nur Bestzeiten ab 3000m (aufwaerts bis Marathon) fliessen in den Riegel-Fit
# ein (riegel_exponent) - kuerzere Distanzen sind zu anaerob gepraegt fuer
# den rein aeroben Ermuedungs-Zusammenhang, den Riegels Formel modelliert.
# Kein eigenes 3000m-Zeitfeld vorhanden, daher effektiv ab 5000m.
RIEGEL_DISTANCES_M = {field: d for field, d in RACE_DISTANCES_M.items() if d >= 3000}


def _least_squares_slope_intercept(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    """Einfache lineare Regression (x, y) -> (Steigung, Achsenabschnitt)
    per kleinste Quadrate, ohne Zusatzabhaengigkeit (kein numpy im Backend).
    None bei weniger als zwei Punkten oder identischen x-Werten (Steigung
    nicht bestimmbar)."""
    if len(points) < 2:
        return None
    n = len(points)
    sum_x = sum(x for x, _ in points)
    sum_y = sum(y for _, y in points)
    sum_xy = sum(x * y for x, y in points)
    sum_xx = sum(x * x for x, _ in points)
    denom = n * sum_xx - sum_x**2
    if denom == 0:
        return None
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return slope, intercept


def _race_time_points(
    race_times_s: dict[str, float | None], distances_m: dict[str, float]
) -> list[tuple[float, float]]:
    """(Distanz in m, Zeit in s) je hinterlegter Bestzeit aus einem Dict im
    User-Feldnamen-Format, eingeschraenkt auf `distances_m` (siehe
    CS_MODEL_DISTANCES_M/RIEGEL_DISTANCES_M) - gemeinsame Grundlage fuer
    riegel_exponent/critical_speed_model."""
    return [
        (distances_m[field], t)
        for field, t in race_times_s.items()
        if t and field in distances_m
    ]


def riegel_exponent(race_times_s: dict[str, float | None]) -> float | None:
    """Riegel-Koeffizient b aus einer Least-Squares-Regression
    ln(T) = ln(a) + b * ln(D) (Peter Riegel, 1977/1981) ueber alle
    vorhandenen Bestzeiten zwischen 3000m und Marathon (RIEGEL_DISTANCES_M -
    kuerzere Distanzen sind zu anaerob gepraegt fuer den rein aeroben
    Ermuedungs-Zusammenhang) - je mehr Distanzen in diesem Bereich
    hinterlegt sind, desto robuster die Schaetzung. None bei weniger als
    zwei passenden Bestzeiten."""
    points = [(math.log(d), math.log(t)) for d, t in _race_time_points(race_times_s, RIEGEL_DISTANCES_M)]
    fit = _least_squares_slope_intercept(points)
    return fit[0] if fit else None


def k_from_riegel_exponent(b: float) -> float:
    """Bildet den Riegel-Koeffizienten b linear auf K in
    [LOAD_K_MIN, LOAD_K_MAX] ab: ein hohes b (geringere Ausdauer relativ
    zur Schnelligkeit) fuehrt zu K->LOAD_K_MIN, ein niedriges b (starke
    Ausdauer) zu K->LOAD_K_MAX - siehe RIEGEL_B_LOW_ENDURANCE/
    RIEGEL_B_HIGH_SPEED. Ausserhalb dieses Bereichs geclampt."""
    if b <= RIEGEL_B_LOW_ENDURANCE:
        return LOAD_K_MAX
    if b >= RIEGEL_B_HIGH_SPEED:
        return LOAD_K_MIN
    t = (b - RIEGEL_B_LOW_ENDURANCE) / (RIEGEL_B_HIGH_SPEED - RIEGEL_B_LOW_ENDURANCE)
    return LOAD_K_MAX + t * (LOAD_K_MIN - LOAD_K_MAX)


def resolve_load_k(override: float | None, race_times_s: dict[str, float | None]) -> float:
    """Bestimmt das tatsaechlich zu verwendende K, in Prioritaet:

    1. `override` (User.load_k) - manuelle Trainer-Kalibrierung.
    2. aus dem Riegel-Koeffizienten berechnet (siehe riegel_exponent/
       k_from_riegel_exponent), falls mindestens zwei passende Bestzeiten
       (3000m-Marathon) hinterlegt sind.
    3. LOAD_K_DEFAULT, falls das nicht reicht.
    """
    if override is not None:
        return override
    b = riegel_exponent(race_times_s)
    if b is None:
        return LOAD_K_DEFAULT
    return k_from_riegel_exponent(b)


def critical_speed_model(race_times_s: dict[str, float | None]) -> tuple[float, float] | None:
    """Critical-Speed-2-Parameter-Modell (Monod & Scherrer 1965 / Hughson
    et al.): Distanz = CS * Zeit + D', linear in der Zeit. CS (m/s) und D'
    (m, anaerobe Distanzkapazitaet) werden per Least-Squares-Regression
    ueber alle vorhandenen Bestzeiten zwischen 800m und 5000m
    (CS_MODEL_DISTANCES_M) geschaetzt (Distanz als Funktion der Zeit:
    Steigung=CS, Achsenabschnitt=D'). None bei weniger als zwei passenden
    Bestzeiten."""
    points = [(t, d) for d, t in _race_time_points(race_times_s, CS_MODEL_DISTANCES_M)]
    return _least_squares_slope_intercept(points)


def resolve_critical_speed_mps(
    use_vlt3: bool,
    computed_cs_mps: float | None,
    v_lt3_mps: float | None,
) -> float | None:
    """Bestimmt die fuer den D'-Balance-Extra-Term (w_prime_balance_extra_
    load) verwendete Critical Speed: die vom Trainer im Athletenprofil
    gewaehlte Quelle (User.cs_use_vlt3) - entweder explizit die Pace bei
    3 mmol/l Laktat (vLT3) statt des theoretisch berechneten CS, oder
    (Standard) der berechnete CS aus critical_speed_model, mit vLT3 als
    Fallback, falls sich CS mangels Bestzeiten nicht berechnen liess."""
    if use_vlt3:
        return v_lt3_mps
    return computed_cs_mps if computed_cs_mps is not None else v_lt3_mps


def load_from_velocity_samples(samples: list[tuple[float, float]], v_lt3_mps: float, k: float | None = None) -> float:
    """Trainingslast aus Geschwindigkeits-/Dauer-Paaren:

    Last = Summe_ueber_Samples( Minuten(v) * (v / vLT3)^K )

    `samples` ist eine Liste von (Geschwindigkeit in m/s, Dauer in
    Sekunden) - z.B. ein Paar je Segment-Wiederholung einer strukturierten
    Einheit (siehe zone_classifier.expand_segment_reps), der gemessene
    Gesamtschnitt einer Einheit, oder, ohne beides, ein Paar je Pace-Zone
    mit einer repraesentativen Geschwindigkeit (siehe zone_classifier.
    zone_reference_velocity_mps).

    `k` ueberschreibt den Standardexponenten - None nutzt LOAD_K_DEFAULT.
    In der Praxis kommt K bereits vorher aufgeloest ueber resolve_load_k
    (Override oder aus dem Riegel-Exponenten berechnet).
    """
    if v_lt3_mps <= 0:
        raise ValueError("v_lt3_mps muss > 0 sein")
    k = k if k is not None else LOAD_K_DEFAULT

    load = 0.0
    for v_mps, duration_s in samples:
        if v_mps <= 0 or duration_s <= 0:
            continue
        minutes = duration_s / 60
        load += minutes * (v_mps / v_lt3_mps) ** k
    return load


# ---------------------------------------------------------------------------
# Extra-Last-Term oberhalb der Critical Speed (D'-Balance-Modell)
# ---------------------------------------------------------------------------

def w_prime_recovery_tau_s(cs_mps: float, recovery_velocity_mps: float) -> float:
    """Variable Erholungs-Zeitkonstante tau_W' nach Skiba et al. (2012,
    "Modeling the expenditure and reconstitution of work capacity above
    critical power"): tau = 546 * exp(-0.01 * DCP) + 316 [Sekunden].

    DCP ("Deficit of Critical Power/Speed") wird hier in Metern/Minute
    berechnet (statt in Watt wie im cycling-Original), da der Koeffizient
    -0.01 sonst bei Laufgeschwindigkeiten in m/s kaum Variation erzeugen
    wuerde. Eine knapp unterhalb CS gelaufene Pause (DCP klein) erholt
    sich dadurch langsamer als eine deutlich lockerere Pause (DCP gross)."""
    dcp_m_per_min = max(0.0, (cs_mps - recovery_velocity_mps) * 60)
    return 546 * math.exp(-0.01 * dcp_m_per_min) + 316


def w_prime_balance_extra_load(segments: list[dict], cs_mps: float | None, d_prime_m: float | None) -> float:
    """Extra-Last-Term oberhalb der Critical Speed (CS) aus dem
    D'-Balance-Modell (Skiba et al. 2012): waelzt die Segmentliste einer
    protokollierten Intervalleinheit (Activity.segments, siehe
    schemas/training_plan.py:PlanSegment) chronologisch Wiederholung fuer
    Wiederholung ab (siehe zone_classifier.expand_segment_reps -
    Durchschnittspace/-laenge je Intervall-Wiederholung, Pausendauer/-pace
    dazwischen) und verfolgt das D'-Defizit (D' minus aktuelle Balance):
    bei Tempo oberhalb CS waechst das Defizit LINEAR mit der Dauer (Rate
    v-CS) - waehrenddessen wird die Flaeche unter dem Defizitverlauf
    (Trapez, geschlossene Loesung statt numerischer Approximation)
    aufsummiert. In Pausen klingt das Defizit EXPONENTIELL mit variabler
    Zeitkonstante ab (w_prime_recovery_tau_s - eine knapp unterhalb CS
    gelaufene Pause erholt sich langsamer als eine deutlich lockerere) und
    bestimmt so den Startwert des naechsten Arbeitsintervalls, traegt
    selbst aber NICHT zur Summe bei (sonst wuerde eine beliebig lange,
    laengst erholte Pause die Last rein durch ihre Dauer aufblaehen, ohne
    dass das etwas mit der tatsaechlichen Belastung zu tun haette).

    Ergebnis: die ueber alle Arbeitsintervalle aufsummierte Defizit-Zeit-
    Flaeche, normiert auf D' und in Minuten (Sekunden/60) - bei
    identischen Arbeitsintervallen liefert eine knappere Pause (das
    Defizit zu Beginn der naechsten Wiederholung ist dann noch hoeher)
    einen groesseren Extra-Term als eine grosszuegige Pause. Additiv zur
    uebrigen (v/vLT3)^K-Last (siehe services/normalizer.py).

    0.0 ohne Segmente oder wenn CS/D' nicht bestimmbar sind (siehe
    resolve_critical_speed_mps/critical_speed_model) - dann bleibt die
    Last unveraendert bei der reinen Pace-Kostenfunktion."""
    from app.services.zone_classifier import expand_segment_reps

    if not segments or not cs_mps or not d_prime_m or cs_mps <= 0 or d_prime_m <= 0:
        return 0.0

    deficit = 0.0  # D' - Balance, 0 = voll erholt
    work_deficit_time_integral = 0.0
    for velocity_mps, duration_s in expand_segment_reps(segments):
        if duration_s <= 0:
            continue
        if velocity_mps > cs_mps:
            rate = velocity_mps - cs_mps
            deficit_end = deficit + rate * duration_s
            work_deficit_time_integral += duration_s * (deficit + deficit_end) / 2
            deficit = deficit_end
        else:
            tau = w_prime_recovery_tau_s(cs_mps, velocity_mps)
            deficit = deficit * math.exp(-duration_s / tau)

    return work_deficit_time_integral / d_prime_m / 60
