from datetime import datetime

import pytest

from app.services import training_load as tl
from app.services.normalizer import NormalizedActivity, build_activity_record
from app.services.zone_classifier import PaceZones, expand_segment_reps


def _hr_activity() -> NormalizedActivity:
    return NormalizedActivity(
        external_id="test-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=3600,
        distance_m=10000,
        avg_hr=150,
        splits=[],
    )


def test_build_activity_record_uses_athlete_gender_for_trimp():
    """Regressionstest: athlete_is_female muss tatsaechlich bis zur
    Banister-TRIMP-Formel durchgereicht werden (siehe
    services/training_load.py:load_from_hr_trimp) - vorher wurde das
    Athletengeschlecht beim Aufruf aus build_activity_record schlicht
    nicht weitergegeben, sodass immer die maennlichen Konstanten
    verwendet wurden."""
    male_record = build_activity_record(
        _hr_activity(), athlete_hr_rest=50, athlete_hr_max=190, pace_zones=None, athlete_is_female=False
    )
    female_record = build_activity_record(
        _hr_activity(), athlete_hr_rest=50, athlete_hr_max=190, pace_zones=None, athlete_is_female=True
    )
    assert male_record["daily_load"] != female_record["daily_load"]


def test_build_activity_record_falls_back_to_target_zone_without_splits():
    # Manuelle Eingabe ohne Kilometersplits (siehe api/activities.py:create_manual_activity)
    # - ohne Fallback bliebe zone_km leer, obwohl die Zielzone bekannt ist.
    normalized = NormalizedActivity(
        external_id="manual-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=1800,
        distance_m=5000,
        avg_hr=None,
        splits=[],
    )
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    record = build_activity_record(
        normalized,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        target_zone="GA1",
    )
    assert record["zone_km"] == {"GA1": 5.0}
    assert record["daily_load"] > 0


def test_build_activity_record_without_pace_zones_has_no_load_from_zone_km():
    # Ohne Pace-Zonen (kein threshold_pace_sec_per_km/vo2max_pace_sec_per_km
    # hinterlegt) fehlt vLT3 fuer die kontinuierliche Pace-Formel - daily_load
    # bleibt 0, statt einen unbegruendeten Wert zu erfinden.
    normalized = NormalizedActivity(
        external_id="manual-1b",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=1800,
        distance_m=5000,
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        normalized,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=None,
        target_zone="GA1",
    )
    assert record["zone_km"] == {"GA1": 5.0}
    assert record["daily_load"] == 0.0


def test_build_activity_record_stores_manual_rpe_as_note_only():
    # manual_rpe wird persistiert (Activity.rpe), geht aber nicht mehr in
    # daily_load ein (Session-RPE-Formel wurde entfernt).
    normalized = NormalizedActivity(
        external_id="manual-1c",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=1800,
        distance_m=None,
        avg_hr=None,
        splits=[],
    )
    with_rpe = build_activity_record(
        normalized, athlete_hr_rest=None, athlete_hr_max=None, pace_zones=None, manual_rpe=8.0
    )
    without_rpe = build_activity_record(
        normalized, athlete_hr_rest=None, athlete_hr_max=None, pace_zones=None, manual_rpe=None
    )
    assert with_rpe["rpe"] == 8.0
    assert without_rpe["rpe"] is None
    assert with_rpe["daily_load"] == without_rpe["daily_load"] == 0.0


def test_build_activity_record_computes_effective_vo2max_for_run():
    # Nur mit Puls UND athletenspezifischen Tempobereichen (siehe
    # normalizer.py:build_activity_record) - beide fehlen in _hr_activity()/
    # pace_zones=None standardmaessig nicht, daher hier explizit gesetzt.
    record = build_activity_record(
        _hr_activity(),
        athlete_hr_rest=50,
        athlete_hr_max=190,
        pace_zones=PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210),
    )
    assert record["effective_vo2max"] is not None


def test_build_activity_record_skips_effective_vo2max_without_pace_zones():
    # Ohne athletenspezifische Tempobereiche fehlt die Referenz, um die
    # gelaufene Pace ueberhaupt einzuordnen - auch mit Puls bleibt
    # effective_vo2max dann None statt einer irrefuehrenden Schaetzung.
    record = build_activity_record(_hr_activity(), athlete_hr_rest=50, athlete_hr_max=190, pace_zones=None)
    assert record["effective_vo2max"] is None


def test_build_activity_record_skips_effective_vo2max_without_hr():
    # Ohne Puls fehlt der Abgleich, ob die gelaufene Pace tatsaechlich der
    # beanspruchten Anstrengung entsprach - effective_vo2max bleibt dann
    # None, selbst mit Distanz/Dauer/Tempobereichen.
    normalized = NormalizedActivity(
        external_id="test-no-hr",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=3600,
        distance_m=10000,
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        normalized,
        athlete_hr_rest=50,
        athlete_hr_max=190,
        pace_zones=PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210),
    )
    assert record["effective_vo2max"] is None


def test_build_activity_record_rounds_distance_to_nearest_100m():
    # Manuelle Eingabe kann beliebig praezise sein (z.B. 5.234km aus einem
    # getippten km-Wert, siehe ManualActivityForm.tsx) - im Datensatz soll
    # das auf 100m (eine Nachkommastelle in km) gerundet ankommen.
    normalized = NormalizedActivity(
        external_id="manual-2",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=1800,
        distance_m=5234,
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        normalized, athlete_hr_rest=None, athlete_hr_max=None, pace_zones=None, target_zone="GA1"
    )
    assert record["distance_m"] == 5200


def test_build_activity_record_uses_average_pace_for_plain_pace_zone_run():
    """Eine einfache (unstrukturierte) Lauf-Einheit mit Gesamtdistanz/-dauer
    nutzt die tatsaechliche Durchschnittsgeschwindigkeit als Sample statt
    der groben Zonen-Referenzgeschwindigkeit - praeziser, siehe
    services/normalizer.py:build_activity_record Prioritaet 2."""
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activity = NormalizedActivity(
        external_id="manual-avgpace-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=900,
        distance_m=3000,  # 3.33 m/s
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        activity, athlete_hr_rest=None, athlete_hr_max=None, pace_zones=pace_zones, target_zone="GA1"
    )
    expected_load = tl.load_from_velocity_samples([(3000 / 900, 900)], pace_zones.v_lt3_mps, tl.LOAD_K_DEFAULT)
    assert record["daily_load"] == pytest.approx(expected_load)


def test_build_activity_record_grade_adjusted_pace_increases_load_for_uphill_run():
    """Hoehenmeter erhoehen ueber die Grade Adjusted Pace (Minetti-Modell,
    siehe training_load.grade_adjustment_factor) die Trainingslast einer
    ansonsten identischen Einheit - ohne diese Anpassung wuerde eine bergige
    Einheit dieselbe (zu niedrige) Last wie eine flache Einheit erhalten."""
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)

    def activity(elevation_gain_m: float | None) -> NormalizedActivity:
        return NormalizedActivity(
            external_id="manual-gap-1",
            start_time=datetime(2026, 1, 1, 8, 0, 0),
            duration_s=1500,
            distance_m=5000,
            avg_hr=None,
            splits=[],
            elevation_gain_m=elevation_gain_m,
        )

    flat = build_activity_record(
        activity(None), athlete_hr_rest=None, athlete_hr_max=None, pace_zones=pace_zones, target_zone="GA1"
    )
    uphill = build_activity_record(
        activity(150.0), athlete_hr_rest=None, athlete_hr_max=None, pace_zones=pace_zones, target_zone="GA1"
    )
    assert uphill["daily_load"] > flat["daily_load"]
    assert uphill["elevation_gain_m"] == 150.0


def test_build_activity_record_uses_segment_samples_for_structured_sessions():
    """Eine strukturierte Einheit (Segmente mit bestimmbarer Pace je
    Wiederholung) nutzt die einzelnen Wiederholungen statt der groben
    Durchschnittsgeschwindigkeit - die stark konvexe (v/vLT3)^K-Formel
    wuerde sonst schnelle Intervalle und lockere Pausen zu einer viel zu
    niedrigen Durchschnittslast vermischen."""
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    segments = [
        {"type": "interval", "repeat": 3, "duration_s": 180, "pace": "3:30", "distance_km": None},
        {"type": "jog_recovery", "repeat": 1, "duration_s": 120, "pace": "7:00", "distance_km": None},
    ]
    # Tatsaechliche Gesamtdistanz/-dauer aus denselben Segmenten (3x 180s bei
    # 3:30/km + 2x 120s Trabpause bei 7:00/km), damit der Vergleich mit der
    # (unstrukturierten) Durchschnittstempo-Last unten fair ist - beide
    # Varianten muessen von derselben Gesamtdistanz/-dauer ausgehen.
    total_duration_s = 3 * 180 + 2 * 120
    total_distance_m = 3 * (180 / 210 * 1000) + 2 * (120 / 420 * 1000)
    activity = NormalizedActivity(
        external_id="manual-segments-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=total_duration_s,
        distance_m=total_distance_m,
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        target_zone="Schwelle",
        segments=segments,
    )
    expected_load = tl.load_from_velocity_samples(
        expand_segment_reps(segments), pace_zones.v_lt3_mps, tl.LOAD_K_DEFAULT
    )
    assert record["daily_load"] == pytest.approx(expected_load)

    avg_velocity_mps = activity.distance_m / activity.duration_s
    avg_pace_load = tl.load_from_velocity_samples(
        [(avg_velocity_mps, activity.duration_s)], pace_zones.v_lt3_mps, tl.LOAD_K_DEFAULT
    )
    assert record["daily_load"] > avg_pace_load


def test_build_activity_record_derives_k_from_riegel_exponent_race_times():
    """Ohne manuellen load_k-Override wird K automatisch aus dem Riegel-
    Ermuedungsexponenten ueber die hinterlegten Bestzeiten berechnet
    (siehe training_load.resolve_load_k) - eine Aktivitaet mit
    hinterlegten Wettkampfzeiten muss daher eine andere Last liefern als
    dieselbe Aktivitaet ohne (dort greift LOAD_K_DEFAULT)."""
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activity = NormalizedActivity(
        external_id="manual-k-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=180,
        distance_m=900,  # 5.0 m/s
        avg_hr=None,
        splits=[],
    )
    race_times = {"race_5k_time_s": 5000 * 0.3, "race_10k_time_s": 0.3 * (10000**1.1)}
    without_race_times = build_activity_record(
        activity, athlete_hr_rest=None, athlete_hr_max=None, pace_zones=pace_zones, target_zone="Schwelle"
    )
    with_race_times = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        target_zone="Schwelle",
        athlete_race_times_s=race_times,
    )

    assert without_race_times["daily_load"] != with_race_times["daily_load"]

    expected_k = tl.resolve_load_k(None, race_times)
    expected_load = tl.load_from_velocity_samples([(5.0, 180)], pace_zones.v_lt3_mps, k=expected_k)
    assert with_race_times["daily_load"] == pytest.approx(expected_load)


def test_build_activity_record_manual_load_k_overrides_riegel_exponent():
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activity = NormalizedActivity(
        external_id="manual-k-2",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=60,
        distance_m=300,  # 5.0 m/s
        avg_hr=None,
        splits=[],
    )
    record = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        target_zone="Schwelle",
        load_k=2.2,
        athlete_race_times_s={"race_5k_time_s": 1200, "race_10k_time_s": 2500},
    )
    expected_load = tl.load_from_velocity_samples([(5.0, 60)], pace_zones.v_lt3_mps, k=2.2)
    assert record["daily_load"] == pytest.approx(expected_load)


def test_build_activity_record_adds_w_prime_balance_extra_term_for_intervals_above_cs():
    """Der D'-Balance-Extra-Term (Riegel/CS/D' aus den Bestzeiten) muss
    additiv zur (v/vLT3)^K-Last hinzukommen, wenn Segmente eine
    Intervallstruktur oberhalb der Critical Speed enthalten."""
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activity = NormalizedActivity(
        external_id="manual-intervals-1",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=600,
        distance_m=None,
        avg_hr=None,
        splits=[],
    )
    # CS/D' aus zwei Bestzeiten, exakt auf D=CS*T+D' konstruiert: CS=5.0, D'=150.
    race_times = {"race_800m_time_s": (800 - 150) / 5.0, "race_5k_time_s": (5000 - 150) / 5.0}
    segments = [
        {"type": "interval", "repeat": 4, "duration_s": 60, "pace": "3:00", "distance_km": None},
        {"type": "jog_recovery", "repeat": 1, "duration_s": 60, "pace": "7:00", "distance_km": None},
    ]

    without_segments = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        athlete_race_times_s=race_times,
        target_zone="Schwelle",
    )
    with_segments = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        athlete_race_times_s=race_times,
        target_zone="Schwelle",
        segments=segments,
    )
    assert with_segments["daily_load"] > without_segments["daily_load"]


def test_build_activity_record_cs_use_vlt3_changes_extra_term():
    pace_zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210, vlt3_pace_sec_per_km=250)
    activity = NormalizedActivity(
        external_id="manual-intervals-2",
        start_time=datetime(2026, 1, 1, 8, 0, 0),
        duration_s=600,
        distance_m=None,
        avg_hr=None,
        splits=[],
    )
    race_times = {"race_800m_time_s": (800 - 150) / 5.0, "race_5k_time_s": (5000 - 150) / 5.0}
    segments = [
        {"type": "interval", "repeat": 4, "duration_s": 60, "pace": "3:00", "distance_km": None},
        {"type": "jog_recovery", "repeat": 1, "duration_s": 60, "pace": "7:00", "distance_km": None},
    ]

    computed_cs_record = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        athlete_race_times_s=race_times,
        target_zone="Schwelle",
        segments=segments,
        cs_use_vlt3=False,
    )
    vlt3_cs_record = build_activity_record(
        activity,
        athlete_hr_rest=None,
        athlete_hr_max=None,
        pace_zones=pace_zones,
        athlete_race_times_s=race_times,
        target_zone="Schwelle",
        segments=segments,
        cs_use_vlt3=True,
    )
    assert computed_cs_record["daily_load"] != vlt3_cs_record["daily_load"]


def test_build_activity_record_uses_trimp_formula_overrides():
    default_record = build_activity_record(
        _hr_activity(), athlete_hr_rest=50, athlete_hr_max=190, pace_zones=None
    )
    overridden_record = build_activity_record(
        _hr_activity(),
        athlete_hr_rest=50,
        athlete_hr_max=190,
        pace_zones=None,
        trimp_exponent_factor=1.0,
        trimp_weight_factor=1.0,
    )
    assert default_record["daily_load"] != overridden_record["daily_load"]
