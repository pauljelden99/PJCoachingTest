from datetime import date, timedelta

import pytest

from app.services.training_load import (
    LOAD_K_DEFAULT,
    LOAD_K_MAX,
    LOAD_K_MIN,
    RIEGEL_B_HIGH_SPEED,
    RIEGEL_B_LOW_ENDURANCE,
    DailyLoadPoint,
    compute_pmc,
    critical_speed_model,
    fill_missing_days,
    grade_adjustment_factor,
    k_from_riegel_exponent,
    latest_pmc,
    load_from_hr_trimp,
    load_from_velocity_samples,
    minetti_running_cost,
    resolve_critical_speed_mps,
    resolve_load_k,
    riegel_exponent,
    w_prime_balance_extra_load,
    w_prime_recovery_tau_s,
)


def test_trimp_within_plausible_range():
    trimp = load_from_hr_trimp(duration_min=60, avg_hr=150, hr_rest=50, hr_max=190)
    assert 80 < trimp < 140


def test_trimp_female_default_differs_from_male():
    male = load_from_hr_trimp(duration_min=60, avg_hr=150, hr_rest=50, hr_max=190, is_female=False)
    female = load_from_hr_trimp(duration_min=60, avg_hr=150, hr_rest=50, hr_max=190, is_female=True)
    assert male != female


def test_trimp_manual_override_wins_over_gender_default():
    overridden = load_from_hr_trimp(
        duration_min=60,
        avg_hr=150,
        hr_rest=50,
        hr_max=190,
        is_female=True,
        exponent_factor=1.92,
        weight_factor=0.64,
    )
    male_default = load_from_hr_trimp(duration_min=60, avg_hr=150, hr_rest=50, hr_max=190, is_female=False)
    assert overridden == male_default


def test_load_from_velocity_samples_at_threshold_equals_minutes():
    # v == vLT3 => (v/vLT3)^K == 1 fuer jedes K.
    load = load_from_velocity_samples([(4.0, 600)], v_lt3_mps=4.0)
    assert load == 10.0


def test_load_from_velocity_samples_penalizes_pace_above_threshold_more():
    below = load_from_velocity_samples([(3.5, 600)], v_lt3_mps=4.0)
    above = load_from_velocity_samples([(4.5, 600)], v_lt3_mps=4.0)
    assert below < 10.0 < above


def test_load_from_velocity_samples_custom_k_changes_load():
    default = load_from_velocity_samples([(5.0, 600)], v_lt3_mps=4.0)
    overridden = load_from_velocity_samples([(5.0, 600)], v_lt3_mps=4.0, k=LOAD_K_MIN)
    assert default != overridden


def test_load_from_velocity_samples_skips_zero_or_negative_entries():
    load = load_from_velocity_samples([(0.0, 600), (4.0, 600), (-1.0, 600)], v_lt3_mps=4.0)
    assert load == 10.0


def test_riegel_exponent_recovers_known_exponent_via_least_squares():
    # Konstruierte Bestzeiten, die exakt auf T = a * D^b liegen (a=0.3,
    # b=1.09) - die Log-Log-Regression muss b exakt zurueckliefern. Nur
    # Distanzen >= 3000m fliessen in den Fit ein (RIEGEL_DISTANCES_M).
    b_true = 1.09
    a = 0.3
    distances = {
        "race_5k_time_s": 5000,
        "race_10k_time_s": 10000,
        "race_hm_time_s": 21097.5,
        "race_marathon_time_s": 42195,
    }
    race_times = {field: a * (dist**b_true) for field, dist in distances.items()}
    assert riegel_exponent(race_times) == pytest.approx(b_true, rel=1e-6)


def test_riegel_exponent_ignores_race_times_below_3000m():
    # 800m/1500m duerfen den Fit nicht beeinflussen - mit nur einer
    # gueltigen (>=3000m) Bestzeit bleibt riegel_exponent trotz vierer
    # hinterlegter Zeiten None.
    race_times = {
        "race_800m_time_s": 120,
        "race_1500m_time_s": 240,
        "race_5k_time_s": 1200,
    }
    assert riegel_exponent(race_times) is None


def test_riegel_exponent_none_with_fewer_than_two_race_times():
    assert riegel_exponent({"race_5k_time_s": 1200}) is None
    assert riegel_exponent({}) is None


def test_k_from_riegel_exponent_bounds_and_clamping():
    assert k_from_riegel_exponent(RIEGEL_B_LOW_ENDURANCE) == LOAD_K_MAX
    assert k_from_riegel_exponent(RIEGEL_B_HIGH_SPEED) == LOAD_K_MIN
    midpoint = (RIEGEL_B_LOW_ENDURANCE + RIEGEL_B_HIGH_SPEED) / 2
    assert k_from_riegel_exponent(midpoint) == pytest.approx((LOAD_K_MIN + LOAD_K_MAX) / 2)
    # ausserhalb des Bereichs geclampt
    assert k_from_riegel_exponent(RIEGEL_B_LOW_ENDURANCE - 0.5) == LOAD_K_MAX
    assert k_from_riegel_exponent(RIEGEL_B_HIGH_SPEED + 0.5) == LOAD_K_MIN


def test_resolve_load_k_override_wins():
    assert resolve_load_k(2.7, {"race_5k_time_s": 1200, "race_10k_time_s": 2500}) == 2.7


def test_resolve_load_k_computed_from_race_times_without_override():
    distances = {"race_5k_time_s": 5000, "race_10k_time_s": 10000, "race_marathon_time_s": 42195}
    race_times = {field: 0.3 * (dist**1.1) for field, dist in distances.items()}
    computed = resolve_load_k(None, race_times)
    assert computed == pytest.approx(k_from_riegel_exponent(riegel_exponent(race_times)))


def test_resolve_load_k_falls_back_to_default_without_enough_race_times():
    assert resolve_load_k(None, {"race_5k_time_s": 1200}) == LOAD_K_DEFAULT
    assert resolve_load_k(None, {}) == LOAD_K_DEFAULT


def test_critical_speed_model_recovers_known_cs_and_d_prime():
    # Konstruierte Bestzeiten, die exakt auf D = CS*T + D' liegen. Nur
    # Distanzen zwischen 800m und 5000m fliessen ein (CS_MODEL_DISTANCES_M).
    cs_true = 4.0
    d_prime_true = 200.0
    distances = {"race_800m_time_s": 800, "race_1500m_time_s": 1500, "race_5k_time_s": 5000}
    race_times = {field: (dist - d_prime_true) / cs_true for field, dist in distances.items()}
    fit = critical_speed_model(race_times)
    assert fit is not None
    cs, d_prime = fit
    assert cs == pytest.approx(cs_true, rel=1e-6)
    assert d_prime == pytest.approx(d_prime_true, rel=1e-6)


def test_critical_speed_model_ignores_race_times_outside_800_to_5000m():
    # 400m und 10km duerfen den Fit nicht beeinflussen - mit nur einer
    # gueltigen (800-5000m) Bestzeit bleibt critical_speed_model trotz
    # vierer hinterlegter Zeiten None.
    race_times = {
        "race_400m_time_s": 55,
        "race_800m_time_s": 120,
        "race_10k_time_s": 2400,
    }
    assert critical_speed_model(race_times) is None


def test_critical_speed_model_none_with_fewer_than_two_race_times():
    assert critical_speed_model({"race_5k_time_s": 1200}) is None


def test_resolve_critical_speed_mps_use_vlt3_true():
    assert resolve_critical_speed_mps(True, computed_cs_mps=4.5, v_lt3_mps=4.0) == 4.0


def test_resolve_critical_speed_mps_prefers_computed_when_not_using_vlt3():
    assert resolve_critical_speed_mps(False, computed_cs_mps=4.5, v_lt3_mps=4.0) == 4.5


def test_resolve_critical_speed_mps_falls_back_to_vlt3_without_computed_cs():
    assert resolve_critical_speed_mps(False, computed_cs_mps=None, v_lt3_mps=4.0) == 4.0


def test_w_prime_recovery_tau_at_cs_pace_is_the_higher_bound():
    assert w_prime_recovery_tau_s(cs_mps=4.0, recovery_velocity_mps=4.0) == pytest.approx(546 + 316)


def test_w_prime_recovery_tau_shrinks_with_easier_recovery():
    tight = w_prime_recovery_tau_s(cs_mps=4.0, recovery_velocity_mps=3.9)
    easy = w_prime_recovery_tau_s(cs_mps=4.0, recovery_velocity_mps=2.0)
    assert easy < tight


def test_w_prime_balance_extra_load_zero_without_segments_or_cs_or_d_prime():
    assert w_prime_balance_extra_load([], cs_mps=4.0, d_prime_m=200.0) == 0.0
    segments = [{"type": "interval", "repeat": 1, "duration_s": 60, "pace": "3:00", "distance_km": None}]
    assert w_prime_balance_extra_load(segments, cs_mps=None, d_prime_m=200.0) == 0.0
    assert w_prime_balance_extra_load(segments, cs_mps=4.0, d_prime_m=None) == 0.0


def test_w_prime_balance_extra_load_positive_for_work_above_cs():
    # 4x 1min bei 5.0 m/s (deutlich oberhalb CS=4.0) mit 2min Trabpause bei 2.0 m/s.
    segments = [
        {"type": "interval", "repeat": 4, "duration_s": 60, "pace": "3:20", "distance_km": None},
        {"type": "jog_recovery", "repeat": 1, "duration_s": 120, "pace": "8:20", "distance_km": None},
    ]
    extra = w_prime_balance_extra_load(segments, cs_mps=4.0, d_prime_m=200.0)
    assert extra > 0


def test_w_prime_balance_extra_load_uses_rest_duration_and_pace():
    """Kernanforderung: der Extra-Term muss sich aendern, wenn sich NUR die
    Pausendauer/-pace aendert (gleiche Arbeitsintervalle) - sonst wuerden
    Pausendauer/-tempo faktisch nicht in die Last eingehen."""
    work = {"type": "interval", "repeat": 4, "duration_s": 45, "pace": "3:20", "distance_km": None}

    short_tight_rest = w_prime_balance_extra_load(
        [work, {"type": "jog_recovery", "repeat": 1, "duration_s": 20, "pace": "5:00", "distance_km": None}],
        cs_mps=4.0,
        d_prime_m=200.0,
    )
    long_easy_rest = w_prime_balance_extra_load(
        [work, {"type": "jog_recovery", "repeat": 1, "duration_s": 180, "pace": "9:00", "distance_km": None}],
        cs_mps=4.0,
        d_prime_m=200.0,
    )
    assert short_tight_rest != long_easy_rest
    # Kurze/knappe Pause laesst das D'-Defizit laenger hoch -> groesserer Extra-Term.
    assert short_tight_rest > long_easy_rest


def test_w_prime_balance_extra_load_zero_when_all_below_cs():
    segments = [{"type": "steady", "repeat": 1, "duration_s": 600, "pace": "6:00", "distance_km": None}]
    assert w_prime_balance_extra_load(segments, cs_mps=4.0, d_prime_m=200.0) == 0.0


def test_minetti_running_cost_uphill_exceeds_flat_cost():
    assert minetti_running_cost(0.0) == pytest.approx(3.6)
    assert minetti_running_cost(0.1) > minetti_running_cost(0.0)


def test_minetti_running_cost_clamps_extreme_gradients():
    # Jenseits von GRADE_CLAMP (+-45%) bleibt der Wert konstant, statt dem
    # (dort unplausiblen) Polynom weiter zu folgen.
    assert minetti_running_cost(0.9) == minetti_running_cost(0.45)
    assert minetti_running_cost(-0.9) == minetti_running_cost(-0.45)


def test_grade_adjustment_factor_is_neutral_without_elevation_or_distance():
    assert grade_adjustment_factor(None, 5000) == 1.0
    assert grade_adjustment_factor(0, 5000) == 1.0
    assert grade_adjustment_factor(100, None) == 1.0
    assert grade_adjustment_factor(100, 0) == 1.0


def test_grade_adjustment_factor_greater_than_one_for_uphill_run():
    # 100 Hoehenmeter auf 5km (2% mittlere Steigung) verteuern die Pace
    # gegenueber der Ebene.
    factor = grade_adjustment_factor(elevation_gain_m=100, distance_m=5000)
    assert factor > 1.0
    assert factor == pytest.approx(minetti_running_cost(0.02) / minetti_running_cost(0.0))


def test_grade_adjustment_factor_increases_with_steeper_gradient():
    gentle = grade_adjustment_factor(elevation_gain_m=50, distance_m=5000)
    steep = grade_adjustment_factor(elevation_gain_m=300, distance_m=5000)
    assert steep > gentle > 1.0


def test_fill_missing_days_adds_zero_load_rest_days():
    start = date(2026, 1, 1)
    raw = [DailyLoadPoint(start, 80), DailyLoadPoint(start + timedelta(days=3), 100)]
    filled = fill_missing_days(raw)
    assert len(filled) == 4
    assert filled[1].load == 0.0
    assert filled[2].load == 0.0


def test_pmc_converges_to_steady_load():
    start = date(2026, 1, 1)
    steady = [DailyLoadPoint(start + timedelta(days=i), 50) for i in range(200)]
    pmc = compute_pmc(steady)
    assert abs(pmc[-1].ctl - 50) < 0.5
    assert abs(pmc[-1].atl - 50) < 0.1
    assert abs(pmc[-1].tsb) < 0.5


def test_atl_reacts_faster_than_ctl_to_a_spike():
    start = date(2026, 1, 1)
    loads = [DailyLoadPoint(start, 0), DailyLoadPoint(start + timedelta(days=1), 200)]
    pmc = compute_pmc(loads)
    assert pmc[-1].atl > pmc[-1].ctl


# --- latest_pmc ------------------------------------------------------------
# latest_pmc ist die Abkuerzung fuer Aufrufer, die nur den aktuellen Stand
# brauchen (api/trainer.py:list_athletes) und laesst trainingsfreie Luecken
# in geschlossener Form abklingen, statt sie Tag fuer Tag durchzurechnen.
# Die Tests halten es an der ausfuehrlichen Variante fest, damit die beiden
# Wege nicht auseinanderlaufen.

def _reference_latest(daily_loads):
    """Der letzte Punkt auf dem ausfuehrlichen Weg."""
    pmc = compute_pmc(fill_missing_days(daily_loads))
    return pmc[-1] if pmc else None


def test_latest_pmc_is_empty_for_no_data():
    assert latest_pmc([]) is None


def test_latest_pmc_matches_full_series_without_gaps():
    start = date(2026, 1, 1)
    loads = [DailyLoadPoint(start + timedelta(days=i), 40 + i % 7 * 10) for i in range(120)]
    fast, reference = latest_pmc(loads), _reference_latest(loads)
    assert fast.day == reference.day
    assert fast.load == pytest.approx(reference.load)
    assert fast.ctl == pytest.approx(reference.ctl)
    assert fast.atl == pytest.approx(reference.atl)


def test_latest_pmc_matches_full_series_across_long_rest_gaps():
    """Der interessante Fall: lange Pausen, die die geschlossene
    Abklingformel gegen die tagweise Iteration abgleichen."""
    start = date(2026, 1, 1)
    loads = [
        DailyLoadPoint(start, 120),
        DailyLoadPoint(start + timedelta(days=1), 90),
        DailyLoadPoint(start + timedelta(days=45), 200),  # 43 Ruhetage
        DailyLoadPoint(start + timedelta(days=46), 60),
        DailyLoadPoint(start + timedelta(days=400), 75),  # ueber ein Jahr Pause
    ]
    fast, reference = latest_pmc(loads), _reference_latest(loads)
    assert fast.day == reference.day
    assert fast.ctl == pytest.approx(reference.ctl)
    assert fast.atl == pytest.approx(reference.atl)


def test_latest_pmc_sums_multiple_activities_on_the_same_day():
    """Mehrere Einheiten an einem Tag zaehlen als EIN Tag mit der Summe -
    dasselbe Verhalten wie fill_missing_days."""
    start = date(2026, 1, 1)
    split = [
        DailyLoadPoint(start, 30),
        DailyLoadPoint(start, 70),
        DailyLoadPoint(start + timedelta(days=1), 50),
    ]
    combined = [DailyLoadPoint(start, 100), DailyLoadPoint(start + timedelta(days=1), 50)]
    assert latest_pmc(split).ctl == pytest.approx(latest_pmc(combined).ctl)
    assert latest_pmc(split).ctl == pytest.approx(_reference_latest(split).ctl)


def test_latest_pmc_accepts_unordered_input():
    """Die Eingabe wird nach Tag sortiert - ein Aufrufer muss sich nicht auf
    die Sortierung seiner Query verlassen."""
    start = date(2026, 1, 1)
    ordered = [DailyLoadPoint(start + timedelta(days=i), 10 * i) for i in range(10)]
    shuffled = [ordered[i] for i in (4, 0, 9, 2, 7, 1, 8, 3, 6, 5)]
    assert latest_pmc(shuffled).day == ordered[-1].day
    assert latest_pmc(shuffled).ctl == pytest.approx(latest_pmc(ordered).ctl)
