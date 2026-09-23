import pytest

from app.services.hr_zones import HrZones, classify_hr, classify_hr_intensity


@pytest.fixture
def zones():
    return HrZones(hr_rest=50, hr_max=190)  # HFR-Spanne 140bpm


def test_low_hr_is_recovery_zone(zones):
    # 60bpm -> (60-50)/140 ~= 7% HFR
    assert classify_hr(60, zones) == "Z1 Erholung"


def test_ga1_pace_hr_is_zone2(zones):
    # 145bpm -> (145-50)/140 ~= 68% HFR
    assert classify_hr(145, zones) == "Z2 Grundlage"


def test_threshold_hr_is_zone4(zones):
    # 176bpm -> (176-50)/140 = 90% HFR
    assert classify_hr(175, zones) == "Z4 Schwelle"


def test_max_hr_is_zone5(zones):
    assert classify_hr(190, zones) == "Z5 Maximal"


def test_invalid_zones_raise():
    with pytest.raises(ValueError):
        HrZones(hr_rest=190, hr_max=180)


def test_classify_hr_intensity_low_is_ga1(zones):
    # 100bpm -> ~36% HFR
    assert classify_hr_intensity(100, zones) == "GA1"


def test_classify_hr_intensity_mid_is_schwelle(zones):
    # 170bpm -> ~86% HFR
    assert classify_hr_intensity(170, zones) == "Schwelle"


def test_classify_hr_intensity_high_is_vo2max(zones):
    # 185bpm -> ~96% HFR
    assert classify_hr_intensity(185, zones) == "VO2max"
