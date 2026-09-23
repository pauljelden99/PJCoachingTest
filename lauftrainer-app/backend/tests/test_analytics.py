from datetime import date, timedelta

import pytest

from app.services.analytics import (
    ACWR_CHRONIC_WINDOW_DAYS,
    RACE_DISTANCES_M,
    acwr_and_risk,
    classify_injury_risk,
    effective_vo2max,
    predict_race_times_from_vdot,
    relative_injury_risk,
    weekly_volume,
    weekly_volume_by_sport,
    weekly_volume_by_zone,
)
from app.services.training_load import PmcPoint


def test_vo2max_within_plausible_range_for_10k_effort():
    # ~42 min 10km (~4:12/km) - realistische Freizeitlaeufer-Leistung
    vo2max = effective_vo2max(distance_m=10000, duration_s=42 * 60)
    assert 40 < vo2max < 60


def test_vo2max_none_for_too_short_effort():
    assert effective_vo2max(distance_m=500, duration_s=90) is None


def test_vo2max_none_for_zero_distance():
    assert effective_vo2max(distance_m=0, duration_s=600) is None


def test_faster_pace_yields_higher_vo2max_at_same_duration():
    slow = effective_vo2max(distance_m=8000, duration_s=2400)
    fast = effective_vo2max(distance_m=10000, duration_s=2400)
    assert fast > slow


def test_weekly_volume_groups_by_iso_week():
    # Montag + Sonntag derselben Woche, dann Montag der Folgewoche
    activities = [
        (date(2026, 1, 5), 5000.0, 1500.0),  # Montag KW2
        (date(2026, 1, 11), 5000.0, 1500.0),  # Sonntag KW2
        (date(2026, 1, 12), 10000.0, 3000.0),  # Montag KW3
    ]
    result = weekly_volume(activities)
    assert len(result) == 2
    assert result[0].week_start == date(2026, 1, 5)
    assert result[0].km == 10.0
    assert result[0].minutes == 50.0
    assert result[1].week_start == date(2026, 1, 12)
    assert result[1].km == 10.0
    assert result[1].minutes == 50.0


def test_weekly_volume_by_zone_groups_by_iso_week_and_zone():
    activities = [
        (date(2026, 1, 5), {"GA1": 1.0}),  # Montag KW2
        (date(2026, 1, 11), {"VO2max": 1.0}),  # Sonntag KW2
        (date(2026, 1, 12), {"GA1": 1.0}),  # Montag KW3
    ]
    result = weekly_volume_by_zone(activities)
    assert len(result) == 2
    assert result[0].week_start == date(2026, 1, 5)
    assert result[0].zone_km == {"GA1": 1.0, "Schwelle": 0.0, "VO2max": 1.0}
    assert result[1].week_start == date(2026, 1, 12)
    assert result[1].zone_km == {"GA1": 1.0, "Schwelle": 0.0, "VO2max": 0.0}


def test_weekly_volume_by_zone_keeps_persisted_zone_km_without_current_pace_zones():
    # zone_km wird beim Erfassen der Activity persistiert (siehe
    # normalizer.build_activity_record) - fehlen dem Athleten *aktuell*
    # konfigurierte Pacezonen (z.B. noch nie gesetzt), duerfen historisch
    # bereits klassifizierte Kilometer nicht verschwinden.
    activities = [(date(2026, 1, 5), {"GA1": 1.0})]
    result = weekly_volume_by_zone(activities)
    assert result[0].zone_km == {"GA1": 1.0, "Schwelle": 0.0, "VO2max": 0.0}


def test_weekly_volume_rounds_to_one_decimal():
    # 5.05km + 3.33km = 8.38km -> auf eine Nachkommastelle gerundet: 8.4km.
    result = weekly_volume([(date(2026, 1, 5), 5050.0, 0.0), (date(2026, 1, 6), 3330.0, 0.0)])
    assert result[0].km == 8.4


def test_weekly_volume_by_sport_groups_by_week_and_sport():
    activities = [
        (date(2026, 1, 5), 5000.0, 1500.0, "GA1"),  # Montag KW2, Laufen
        (date(2026, 1, 6), 20000.0, 3600.0, "Radfahren (GA1)"),  # Dienstag KW2, Radfahren
        (date(2026, 1, 7), 2000.0, 1200.0, "Schwimmen (GA1)"),  # Mittwoch KW2, Schwimmen
        (date(2026, 1, 8), 3000.0, 900.0, None),  # ohne Zielzone -> zaehlt zu keiner Sportart
        (date(2026, 1, 8), 1000.0, 600.0, "Athletik"),  # distanzlose Einheit -> keine Sportart (kein sport_of_target_zone)
        (date(2026, 1, 12), 10000.0, 3000.0, "Schwelle"),  # Montag KW3, Laufen
        (date(2026, 1, 13), None, 3600.0, "Radfahren (GA1)"),  # Dienstag KW3, Rad ohne Distanz -> zaehlt trotzdem in Minuten
    ]
    result = weekly_volume_by_sport(activities)
    by_week_sport = {(p.week_start, p.sport): (p.km, p.minutes) for p in result}
    assert by_week_sport == {
        (date(2026, 1, 5), "run"): (5.0, 25.0),
        (date(2026, 1, 5), "bike"): (20.0, 60.0),
        (date(2026, 1, 5), "swim"): (2.0, 20.0),
        (date(2026, 1, 12), "run"): (10.0, 50.0),
        (date(2026, 1, 12), "bike"): (0.0, 60.0),
    }


def test_predict_race_times_from_vdot_roundtrips_through_effective_vo2max():
    # Ein Wettkampf-Bestwert (10km in 40min) ergibt per effective_vo2max ein
    # VDOT - predict_race_times_from_vdot muss aus genau diesem VDOT wieder
    # (in etwa) dieselbe 10km-Zeit zurueckliefern (Umkehrfunktion).
    vdot = effective_vo2max(distance_m=10000, duration_s=2400)
    predictions = predict_race_times_from_vdot(vdot)
    assert abs(predictions["10k"] - 2400) < 1.0
    assert predictions["marathon"] > predictions["half_marathon"] > predictions["10k"] > predictions["5k"]
    assert set(predictions.keys()) == set(RACE_DISTANCES_M.keys())


def test_predict_race_times_from_vdot_matches_effective_vo2max_at_solution():
    # Die gefundene Dauer je Distanz muss (rueckwaerts durch
    # effective_vo2max gerechnet) wieder denselben VDOT ergeben.
    vdot = 55.0
    predictions = predict_race_times_from_vdot(vdot)
    for label, duration_s in predictions.items():
        distance_m = RACE_DISTANCES_M[label]
        assert effective_vo2max(distance_m, duration_s) == pytest.approx(vdot, abs=0.05)


def test_predict_race_times_from_vdot_empty_for_invalid_vdot():
    assert predict_race_times_from_vdot(None) == {}
    assert predict_race_times_from_vdot(0) == {}
    assert predict_race_times_from_vdot(-5) == {}


def test_classify_injury_risk_zones():
    assert classify_injury_risk(0.5) == "unterbelastung"
    assert classify_injury_risk(1.0) == "optimal"
    assert classify_injury_risk(1.4) == "erhoeht"
    assert classify_injury_risk(1.8) == "hoch"


def test_relative_injury_risk_matches_reference_table():
    # Werte exakt an den Stuetzstellen der vom Trainer vorgegebenen Tabelle
    # (Blanch & Gabbett 2016) - siehe RISK_MULTIPLIER_TABLE.
    assert relative_injury_risk(0.0) == pytest.approx(2.35)
    assert relative_injury_risk(0.5) == pytest.approx(1.00)
    assert relative_injury_risk(1.0) == pytest.approx(0.66)
    assert relative_injury_risk(1.5) == pytest.approx(1.31)
    assert relative_injury_risk(2.5) == pytest.approx(5.61)


def test_relative_injury_risk_interpolates_between_stops():
    # Genau mittig zwischen 0.50 (x1.00) und 0.75 (x0.71).
    assert relative_injury_risk(0.625) == pytest.approx((1.00 + 0.71) / 2)


def test_relative_injury_risk_extrapolates_above_table():
    # Oberhalb von 2.50 mit der Steigung des letzten Segments (2.25 -> 2.50)
    # weiter ansteigend statt bei 5.61 gedeckelt.
    above = relative_injury_risk(2.75)
    assert above > relative_injury_risk(2.5)


def _pmc_days(loads: list[float]) -> list[PmcPoint]:
    start = date(2026, 1, 1)
    return [PmcPoint(day=start + timedelta(days=i), load=load, ctl=0, atl=0) for i, load in enumerate(loads)]


def test_acwr_computes_with_partial_window_before_28_days():
    # Anders als ein starres 28-Tage-Minimum: die ACWR soll ab dem ersten
    # Trainingstag einen echten Wert liefern (mit dem bislang verfuegbaren
    # Fenster statt "unbekannt" zu erzwingen) - ein neuer Athlet soll nicht
    # erst nach 4 Wochen eine auswertbare Kennzahl sehen.
    pmc = _pmc_days([50.0] * 10)
    points = acwr_and_risk(pmc)
    last = points[-1]
    assert last.risk != "unbekannt"
    assert abs(last.acwr - 1.0) < 1e-9


def test_acwr_uses_rolling_7_over_28_day_average():
    # 21 Tage Grundlast 50, dann ein 7-taegiger akuter Belastungsspitze auf 100 -
    # klassische Gabbett-ACWR: gleitender 7-Tage-Schnitt / gleitender 28-Tage-Schnitt.
    loads = [50.0] * 21 + [100.0] * 7
    pmc = _pmc_days(loads)
    points = acwr_and_risk(pmc)

    last = points[-1]
    expected_chronic_avg = (21 * 50.0 + 7 * 100.0) / 28
    expected_acute_avg = 100.0
    expected_acwr = expected_acute_avg / expected_chronic_avg
    assert abs(last.acwr - expected_acwr) < 1e-9
    assert last.risk == classify_injury_risk(expected_acwr)


def test_acwr_high_risk_for_spike_from_zero_chronic_base():
    # 27 Tage komplette Pause (chronic_avg = 0), dann eine Belastungsspitze -
    # der klassische Gabbett-Fall (Wiedereinstieg ohne Basis) ist gerade das
    # hoechste Verletzungsrisiko und darf nicht als "unbekannt" durchrutschen
    # (0/0 waere sonst als 0.0 -> faelschlich "unterbelastung" oder verworfen).
    loads = [0.0] * (ACWR_CHRONIC_WINDOW_DAYS - 1) + [80.0]
    pmc = _pmc_days(loads)
    points = acwr_and_risk(pmc)
    assert points[-1].risk == "hoch"


def test_acwr_unbekannt_when_no_training_at_all():
    # Vollstaendiges Fenster, aber weder akute noch chronische Last - hier
    # gibt es (noch) keine Trainingshistorie zu bewerten.
    pmc = _pmc_days([0.0] * ACWR_CHRONIC_WINDOW_DAYS)
    points = acwr_and_risk(pmc)
    assert points[-1].risk == "unbekannt"


def test_acwr_ignores_ctl_atl_fields():
    # Regressionstest: die ACWR darf nicht mehr aus den EWMA-basierten
    # CTL/ATL-Feldern genaehert werden (siehe services/analytics.py -
    # das waere eine andere Groesse als Gabbetts Original-ACWR und die
    # 0.8/1.3/1.5-Schwellen sind dafuer nicht kalibriert). Zwei PMC-Reihen
    # mit identischer Tageslast aber unterschiedlichen ctl/atl-Werten
    # muessen dieselbe ACWR liefern.
    loads = [60.0] * ACWR_CHRONIC_WINDOW_DAYS
    pmc_a = _pmc_days(loads)
    pmc_b = [PmcPoint(day=p.day, load=p.load, ctl=999, atl=1) for p in pmc_a]
    assert acwr_and_risk(pmc_a)[-1].acwr == acwr_and_risk(pmc_b)[-1].acwr
