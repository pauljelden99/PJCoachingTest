from datetime import date, timedelta

from app.services.hr_zones import HrZones
from app.services.training_zones import (
    ActivityZoneInput,
    PlannedSessionInput,
    compute_weekly_pace_zone_minutes,
    compute_weekly_zone_summary,
    compute_zone_summary,
    hr_zone_minutes,
    pace_zone_km,
    pace_zone_minutes,
)
from app.services.zone_classifier import PaceZones

DAY = date(2026, 8, 1)  # ein Samstag -> Wochenstart Montag 2026-07-27
DAY2 = date(2026, 8, 2)
WEEK1_MONDAY = date(2026, 7, 27)
WEEK2_MONDAY = date(2026, 8, 3)


def make_activity(distance_m=8000, duration_s=2400, avg_hr=None, zone_km=None, day=DAY, target_zone=None):
    return ActivityZoneInput(
        day=day,
        distance_m=distance_m,
        duration_s=duration_s,
        avg_hr=avg_hr,
        zone_km=zone_km or {},
        target_zone=target_zone,
    )


def test_pace_zone_minutes_none_zones_returns_zeroed_dict():
    activities = [make_activity(duration_s=300, zone_km={"GA1": 1.0})]
    totals = pace_zone_minutes(activities, None)
    assert totals == {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0, "Sprint/Reps": 0.0}


def test_pace_zone_minutes_sums_across_activities():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activities = [
        make_activity(duration_s=290, zone_km={"GA1": 1.0}),
        make_activity(duration_s=290, zone_km={"GA1": 1.0}),
    ]
    totals = pace_zone_minutes(activities, zones)
    assert totals["GA1"] == 2 * 290 / 60


def test_pace_zone_minutes_distributes_duration_proportionally_to_zone_km():
    # Eine Einheit mit gemischten Zonen (z.B. eine strukturierte Schwellen-
    # einheit ohne GPS-Splits, zone_km aus Segmenten - siehe
    # zone_classifier.zone_km_from_target) verteilt ihre Gesamtzeit
    # proportional zum Kilometeranteil jeder Zone.
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activities = [make_activity(duration_s=1200, zone_km={"GA1": 3.0, "Schwelle": 1.0})]
    totals = pace_zone_minutes(activities, zones)
    assert totals["GA1"] == 15.0  # 1200s * 3/4 / 60
    assert totals["Schwelle"] == 5.0  # 1200s * 1/4 / 60


def test_pace_zone_km_none_zones_returns_zeroed_dict():
    activities = [make_activity(zone_km={"GA1": 1.0})]
    totals = pace_zone_km(activities, None)
    assert totals == {"GA1": 0.0, "Schwelle": 0.0, "VO2max": 0.0, "Sprint/Reps": 0.0}


def test_pace_zone_km_sums_across_activities():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activities = [
        make_activity(zone_km={"GA1": 1.0}),
        make_activity(zone_km={"GA1": 1.0}),
    ]
    totals = pace_zone_km(activities, zones)
    assert totals["GA1"] == 2.0


def test_hr_zone_minutes_ignores_activities_without_hr():
    zones = HrZones(hr_rest=50, hr_max=190)
    activities = [make_activity(duration_s=1800, avg_hr=None)]
    totals = hr_zone_minutes(activities, zones)
    assert sum(totals.values()) == 0.0


def test_hr_zone_minutes_buckets_by_average_hr():
    zones = HrZones(hr_rest=50, hr_max=190)
    activities = [make_activity(duration_s=1800, avg_hr=145)]  # ~68% HFR -> Z2
    totals = hr_zone_minutes(activities, zones)
    assert totals["Z2 Grundlage"] == 30.0


def test_hr_zone_minutes_none_zones_returns_zeroed_dict():
    totals = hr_zone_minutes([make_activity(avg_hr=150)], None)
    assert sum(totals.values()) == 0.0


def test_zone_summary_pace_zone_pct_over_the_period():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    planned = [
        PlannedSessionInput(day=DAY, title="Langer Lauf", target_zone="GA1", target_distance_km=10),
        PlannedSessionInput(day=DAY2, title="Dauerlauf", target_zone="GA1", target_distance_km=10),
    ]
    activities = [make_activity(day=DAY, zone_km={"GA1": 18.0})]
    result = compute_zone_summary(planned, activities, zones)
    ga1 = next(p for p in result if p.zone == "GA1")
    assert ga1.unit == "km"
    assert ga1.planned == 20.0
    assert ga1.actual == 18.0
    assert ga1.pct == 90.0


def test_zone_summary_no_plan_gives_none_pct():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activities = [make_activity(zone_km={"Schwelle": 5.0})]
    result = compute_zone_summary([], activities, zones)
    schwelle = next(p for p in result if p.zone == "Schwelle")
    assert schwelle.planned == 0.0
    assert schwelle.actual == 5.0
    assert schwelle.pct is None


def test_zone_summary_duration_zone_uses_minutes():
    planned = [
        PlannedSessionInput(
            day=DAY, title="Kraft", target_zone="Athletik", target_distance_km=None, target_duration_s=3600
        )
    ]
    activities = [make_activity(day=DAY, duration_s=1800, distance_m=None, target_zone="Athletik")]
    result = compute_zone_summary(planned, activities, None)
    athletik = next(p for p in result if p.zone == "Athletik")
    assert athletik.unit == "minutes"
    assert athletik.planned == 60.0
    assert athletik.actual == 30.0
    assert athletik.pct == 50.0


def test_zone_summary_beweglichkeit_actual_without_plan():
    activities = [make_activity(day=DAY, duration_s=900, distance_m=None, target_zone="Beweglichkeit")]
    result = compute_zone_summary([], activities, None)
    beweglichkeit = next(p for p in result if p.zone == "Beweglichkeit")
    assert beweglichkeit.planned == 0.0
    assert beweglichkeit.actual == 15.0
    assert beweglichkeit.pct is None


# "Sprint/Reps" ist eine vierte Lauf-Pace-Zone (km-basiert, wie GA1/
# Schwelle/VO2max), keine dauerbasierte Zone wie Athletik/Beweglichkeit -
# siehe services/training_zones.py:PACE_ZONES-Kommentar. Planung erfolgt
# ueber target_distance_km, Ist ueber Activity.zone_km (hier direkt
# vorgegeben, wie bei test_zone_summary_pace_zone_pct_over_the_period).
def test_zone_summary_sprint_reps_uses_km():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    planned = [
        PlannedSessionInput(day=DAY, title="Sprints", target_zone="Sprint/Reps", target_distance_km=2.0)
    ]
    activities = [make_activity(day=DAY, zone_km={"Sprint/Reps": 1.5}, target_zone="Sprint/Reps")]
    result = compute_zone_summary(planned, activities, zones)
    sprint = next(p for p in result if p.zone == "Sprint/Reps")
    assert sprint.unit == "km"
    assert sprint.planned == 2.0
    assert sprint.actual == 1.5
    assert sprint.pct == 75.0


WEEK2_DAY = date(2026, 8, 8)  # Samstag in Woche 2 (Wochenstart WEEK2_MONDAY)


def test_weekly_zone_summary_buckets_by_calendar_week():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    planned = [
        PlannedSessionInput(day=DAY, title="Langer Lauf", target_zone="GA1", target_distance_km=10),
        PlannedSessionInput(day=WEEK2_DAY, title="Langer Lauf", target_zone="GA1", target_distance_km=12),
    ]
    activities = [
        make_activity(day=DAY, zone_km={"GA1": 9.0}),
        make_activity(day=WEEK2_DAY, zone_km={"GA1": 12.0}),
    ]
    result = compute_weekly_zone_summary(
        planned, activities, zones, WEEK1_MONDAY, WEEK2_MONDAY + timedelta(days=7)
    )
    week1 = next(p for p in result if p.week_start == WEEK1_MONDAY and p.zone == "GA1")
    week2 = next(p for p in result if p.week_start == WEEK2_MONDAY and p.zone == "GA1")
    assert week1.planned == 10.0 and week1.actual == 9.0
    assert week2.planned == 12.0 and week2.actual == 12.0


def test_weekly_zone_summary_omits_weeks_without_plan_or_activity():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    result = compute_weekly_zone_summary([], [], zones, WEEK1_MONDAY, WEEK2_MONDAY + timedelta(days=7))
    assert result == []


def test_weekly_zone_summary_duration_zone_uses_minutes():
    planned = [
        PlannedSessionInput(
            day=DAY, title="Kraft", target_zone="Athletik", target_distance_km=None, target_duration_s=3600
        )
    ]
    activities = [make_activity(day=DAY, duration_s=1800, distance_m=None, target_zone="Athletik")]
    result = compute_weekly_zone_summary(
        planned, activities, None, WEEK1_MONDAY, WEEK1_MONDAY + timedelta(days=7)
    )
    athletik = next(p for p in result if p.zone == "Athletik")
    assert athletik.unit == "minutes"
    assert athletik.planned == 60.0
    assert athletik.actual == 30.0


def test_weekly_pace_zone_minutes_distributes_duration_proportionally():
    zones = PaceZones(threshold_pace_sec_per_km=240, vo2max_pace_sec_per_km=210)
    activities = [make_activity(day=DAY, duration_s=1200, zone_km={"GA1": 3.0, "Schwelle": 1.0})]
    result = compute_weekly_pace_zone_minutes(activities, zones, WEEK1_MONDAY, WEEK1_MONDAY + timedelta(days=7))
    ga1 = next(p for p in result if p.zone == "GA1")
    schwelle = next(p for p in result if p.zone == "Schwelle")
    assert ga1.unit == "minutes" and ga1.week_start == WEEK1_MONDAY
    assert ga1.actual == 15.0  # 1200s * 3/4 / 60
    assert schwelle.actual == 5.0  # 1200s * 1/4 / 60


def test_weekly_pace_zone_minutes_covers_every_week_even_without_data():
    result = compute_weekly_pace_zone_minutes([], None, WEEK1_MONDAY, WEEK2_MONDAY + timedelta(days=7))
    weeks = {p.week_start for p in result}
    assert weeks == {WEEK1_MONDAY, WEEK2_MONDAY}
    assert all(p.actual == 0.0 for p in result)
