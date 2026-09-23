import pytest

from app.services.zone_classifier import (
    PaceZones,
    Split,
    classify_distance,
    classify_split,
    pace_to_velocity_mps,
    zone_km_from_target,
    zone_reference_velocity_mps,
)


@pytest.fixture
def zones():
    # Schwelle 4:00/km, VO2max 3:30/km
    return PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)


def test_slow_split_is_ga1(zones):
    split = Split(distance_km=1.0, duration_s=290)  # ~4:50/km
    assert classify_split(split, zones) == "GA1"


def test_threshold_pace_split_is_schwelle(zones):
    split = Split(distance_km=1.0, duration_s=242)  # ~4:02/km
    assert classify_split(split, zones) == "Schwelle"


def test_fast_split_is_vo2max(zones):
    split = Split(distance_km=1.0, duration_s=215)  # ~3:35/km
    assert classify_split(split, zones) == "VO2max"


def test_classify_distance_sums_per_zone(zones):
    splits = [
        Split(distance_km=1.0, duration_s=290),
        Split(distance_km=1.0, duration_s=242),
        Split(distance_km=1.0, duration_s=215),
    ]
    assert classify_distance(splits, zones) == {"GA1": 1.0, "Schwelle": 1.0, "VO2max": 1.0}


def test_invalid_zones_raise():
    with pytest.raises(ValueError):
        PaceZones(threshold_pace_sec_per_km=200, vo2max_pace_sec_per_km=220)


def test_zone_km_from_target_uses_whole_distance_for_target_zone():
    assert zone_km_from_target(distance_m=8000, target_zone="GA1", segments=None) == {"GA1": 8.0}


def test_zone_km_from_target_sums_segments_with_zone_and_distance():
    segments = [
        {"zone": "GA1", "distance_km": 2.0, "repeat": 1},
        {"zone": "Schwelle", "distance_km": 1.0, "repeat": 3},
        {"zone": "GA1", "distance_km": 1.0, "repeat": 1},
    ]
    assert zone_km_from_target(distance_m=None, target_zone=None, segments=segments) == {
        "GA1": 3.0,
        "Schwelle": 3.0,
    }


def test_zone_km_from_target_segments_take_priority_over_target_zone():
    segments = [{"zone": "VO2max", "distance_km": 1.0, "repeat": 1}]
    result = zone_km_from_target(distance_m=8000, target_zone="GA1", segments=segments)
    assert result == {"VO2max": 1.0}


def test_zone_km_from_target_empty_without_zone_or_distance():
    assert zone_km_from_target(distance_m=None, target_zone=None, segments=None) == {}
    assert zone_km_from_target(distance_m=8000, target_zone="Athletik", segments=None) == {}
    assert zone_km_from_target(distance_m=None, target_zone="GA1", segments=None) == {}


def test_pace_to_velocity_mps_is_inverse_relationship():
    assert pace_to_velocity_mps(250) == pytest.approx(4.0)


def test_v_lt3_mps_falls_back_to_threshold_pace(zones):
    assert zones.v_lt3_mps == pytest.approx(pace_to_velocity_mps(240))


def test_v_lt3_mps_uses_vlt3_pace_when_set():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210, vlt3_pace_sec_per_km=230)
    assert zones.v_lt3_mps == pytest.approx(pace_to_velocity_mps(230))


def test_zone_reference_velocity_mps_orders_ga1_below_schwelle_below_vo2max(zones):
    ga1 = zone_reference_velocity_mps("GA1", zones)
    schwelle = zone_reference_velocity_mps("Schwelle", zones)
    vo2max = zone_reference_velocity_mps("VO2max", zones)
    assert ga1 < schwelle < vo2max
