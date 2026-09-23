from datetime import date, timedelta

from app.services.wellness import (
    BASELINE_WINDOW_DAYS,
    MIN_BASELINE_POINTS,
    WellnessEntryInput,
    compute_baseline_series,
)

DAY0 = date(2026, 8, 1)


def test_baseline_none_when_too_few_points_in_window():
    entries = [WellnessEntryInput(day=DAY0 - timedelta(days=i), value=60.0) for i in range(MIN_BASELINE_POINTS - 1)]
    points = compute_baseline_series(entries, DAY0, DAY0 + timedelta(days=1))
    assert points[0].baseline_mean is None
    assert points[0].baseline_lower is None
    assert points[0].baseline_upper is None


def test_baseline_mean_and_band_with_enough_points():
    entries = [WellnessEntryInput(day=DAY0 - timedelta(days=i), value=60.0) for i in range(MIN_BASELINE_POINTS)]
    points = compute_baseline_series(entries, DAY0, DAY0 + timedelta(days=1))
    point = points[0]
    # konstante Werte -> Standardabweichung 0 -> Band faellt mit dem Mittelwert zusammen
    assert point.baseline_mean == 60.0
    assert point.baseline_lower == 60.0
    assert point.baseline_upper == 60.0


def test_baseline_band_widens_with_spread():
    values = [55.0, 58.0, 60.0, 62.0, 65.0]
    entries = [WellnessEntryInput(day=DAY0 - timedelta(days=i), value=v) for i, v in enumerate(values)]
    points = compute_baseline_series(entries, DAY0, DAY0 + timedelta(days=1))
    point = points[0]
    assert point.baseline_lower < point.baseline_mean < point.baseline_upper


def test_baseline_window_excludes_entries_older_than_30_days():
    entries = [WellnessEntryInput(day=DAY0 - timedelta(days=i), value=60.0) for i in range(MIN_BASELINE_POINTS)]
    # Ein alter Ausreisser weit ausserhalb des 30-Tage-Fensters darf die Baseline nicht beeinflussen.
    entries.append(WellnessEntryInput(day=DAY0 - timedelta(days=BASELINE_WINDOW_DAYS + 5), value=200.0))
    points = compute_baseline_series(entries, DAY0, DAY0 + timedelta(days=1))
    assert points[0].baseline_mean == 60.0


def test_value_reflects_the_days_own_entry_or_none():
    entries = [WellnessEntryInput(day=DAY0, value=42.0)]
    points = compute_baseline_series(entries, DAY0, DAY0 + timedelta(days=2))
    assert points[0].value == 42.0
    assert points[1].value is None


def test_one_point_per_day_in_requested_range():
    points = compute_baseline_series([], DAY0, DAY0 + timedelta(days=5))
    assert [p.day for p in points] == [DAY0 + timedelta(days=i) for i in range(5)]
