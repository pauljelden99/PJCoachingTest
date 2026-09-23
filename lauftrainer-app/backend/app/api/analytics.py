from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_can_access_athlete, get_current_user
from app.models.activity import Activity
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOut,
    MonthStatsOut,
    PeriodStatsOut,
    Vo2maxPointOut,
    WeeklyVolumeByZoneOut,
    WeeklyVolumeBySportOut,
    WeeklyVolumeOut,
    WorkloadRiskPointOut,
    YearStatsOut,
)
from app.services.analytics import (
    PeriodStatsInput,
    acwr_and_risk,
    compute_period_stats,
    predict_race_times_from_vdot,
    weekly_volume,
    weekly_volume_by_sport,
    weekly_volume_by_zone,
)
from app.services.training_load import DailyLoadPoint, compute_pmc, fill_missing_days
from app.services.training_zones import sport_of_target_zone

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

REFERENCE_LOOKBACK_DAYS = 90


@router.get("/{athlete_id}", response_model=AnalyticsOut)
def get_analytics(
    athlete_id: int,
    days: int | None = Query(None, ge=1, le=3650, description="Nur `workload` auf diesen Zeitraum kuerzen"),
    start: date | None = Query(None, description="Ueberschreibt `days` mit einem festen [start, end)-Fenster"),
    end: date | None = Query(None, description="Exklusiv, nur zusammen mit `start` wirksam"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """CTL/ATL/TSB/ACWR (`workload`) werden immer aus der **kompletten**
    Trainingshistorie berechnet (die EWMA braucht die Vorgeschichte, sonst
    spraenge CTL beim Fensterwechsel faelschlich auf 0) - `days`/`start`/
    `end` kuerzen erst das fertige Ergebnis auf den angezeigten Zeitraum
    (siehe frontend/src/components/WorkloadRiskChart.tsx), analog zu
    api/training_zones.py. `weekly_volume`/`weekly_volume_by_zone`/
    `weekly_volume_by_sport`/`vo2max_series` haben keine Vorgeschichten-
    Abhaengigkeit und werden daher direkt auf denselben Zeitraum gekuerzt
    (Dashboard-Zeitraumauswahl: rollierende Tage, oder ein fester Monat/Jahr
    ueber `start`/`end`). Ohne `days`/`start`/`end` (Rueckwaertskompatibilitaet)
    wird wie bisher die volle Historie zurueckgegeben."""
    ensure_can_access_athlete(athlete_id, current_user)
    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")
    # Bewusst nur die hier ausgewerteten Spalten statt vollstaendiger
    # ORM-Objekte (die Abfrage geht ueber die KOMPLETTE Historie, s.u.):
    # damit bleiben die grossen, hier ungenutzten JSON-Spalten splits/
    # segments und die Textfelder aus dem Transfer und der Deserialisierung.
    activities = (
        db.query(
            Activity.id,
            Activity.day,
            Activity.distance_m,
            Activity.duration_s,
            Activity.zone_km,
            Activity.target_zone,
            Activity.effective_vo2max,
            Activity.daily_load,
        )
        .filter(Activity.athlete_id == athlete_id)
        .order_by(Activity.day)
        .all()
    )

    if start is not None:
        display_start, display_end = start, end
    elif days is not None:
        display_start, display_end = date.today() - timedelta(days=days), None
    else:
        display_start, display_end = None, None

    display_activities = [
        a
        for a in activities
        if (display_start is None or a.day >= display_start) and (display_end is None or a.day < display_end)
    ]

    # Effektiver VO2max ist eine laufspezifische Kennzahl (Daniels-Gilbert-
    # Formel, siehe services/analytics.py:effective_vo2max) - fuer Rad/
    # Schwimmen ist a.effective_vo2max heute zwar immer None (services/
    # normalizer.py), der Sport-Filter macht das aber explizit statt sich
    # implizit darauf zu verlassen (siehe auch die Referenzleistung unten).
    vo2max_series: list[Vo2maxPointOut] = [
        Vo2maxPointOut(day=a.day, activity_id=a.id, vo2max=a.effective_vo2max)
        for a in display_activities
        if a.effective_vo2max is not None and sport_of_target_zone(a.target_zone) in (None, "run")
    ]

    weekly = weekly_volume([(a.day, a.distance_m, a.duration_s) for a in display_activities])
    weekly_by_zone = weekly_volume_by_zone([(a.day, a.zone_km or {}) for a in display_activities])
    weekly_by_sport = weekly_volume_by_sport(
        [(a.day, a.distance_m, a.duration_s, a.target_zone) for a in display_activities]
    )

    # Referenz-VDOT fuer die Wettkampfprognose: der hoechste effektive
    # VO2max der letzten 90 Tage (Proxy fuer die aktuelle Bestform ohne
    # eigene Wettkampf-Erfassung) - bewusst unabhaengig von der Dashboard-
    # Zeitraumauswahl oben (`display_start`/`display_end`), sonst zeigt das
    # Betrachten eines vergangenen Monats/Jahres eine leere Prognose statt
    # der aktuell besten bekannten Leistung. Explizit auf Laufaktivitaeten
    # beschraenkt (siehe Kommentar bei vo2max_series oben) - wichtig, damit
    # eine kuenftige radspezifische Fitness-Kennzahl (z.B. aus Watt-Daten)
    # hier nicht versehentlich als Referenz fuer eine Lauf-Wettkampfprognose
    # herangezogen wird, falls sie je effective_vo2max mitbefuellen sollte.
    cutoff = date.today() - timedelta(days=REFERENCE_LOOKBACK_DAYS)
    recent_vo2max_values = [
        a.effective_vo2max
        for a in activities
        if a.effective_vo2max is not None
        and a.day >= cutoff
        and sport_of_target_zone(a.target_zone) in (None, "run")
    ]
    predictions = predict_race_times_from_vdot(max(recent_vo2max_values, default=None))

    daily_loads = [DailyLoadPoint(day=a.day, load=a.daily_load) for a in activities]
    pmc = compute_pmc(fill_missing_days(daily_loads))
    workload_points = acwr_and_risk(pmc)

    # Anzeigefenster erst HIER auf `workload` anwenden (siehe Docstring oben) -
    # CTL/ATL oben sind bereits mit voller Vorgeschichte berechnet;
    # `display_start`/`display_end` wurden bereits weiter oben bestimmt.
    if display_start is not None:
        workload_points = [p for p in workload_points if p.day >= display_start]
    if display_end is not None:
        workload_points = [p for p in workload_points if p.day < display_end]

    workload = [
        WorkloadRiskPointOut(
            day=p.day,
            load=p.load,
            ctl=p.ctl,
            atl=p.atl,
            tsb=p.tsb,
            acwr=p.acwr,
            risk=p.risk,
            risk_multiplier=p.risk_multiplier,
        )
        for p in workload_points
    ]

    return AnalyticsOut(
        vo2max_series=vo2max_series,
        weekly_volume=[WeeklyVolumeOut(week_start=p.week_start, km=p.km, minutes=p.minutes) for p in weekly],
        weekly_volume_by_zone=[
            WeeklyVolumeByZoneOut(week_start=p.week_start, **p.zone_km) for p in weekly_by_zone
        ],
        weekly_volume_by_sport=[
            WeeklyVolumeBySportOut(week_start=p.week_start, sport=p.sport, km=p.km, minutes=p.minutes)
            for p in weekly_by_sport
        ],
        predictions=predictions,
        workload=workload,
    )


@router.get("/{athlete_id}/period-stats", response_model=PeriodStatsOut)
def get_period_stats(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Jahres-/Monatsstatistik (Durchschnittskilometer pro Woche, Anteil
    GA1/Schwelle/VO2max, mittlerer effektiver VO2max) fuer die "Trainingsjahre"-
    Tabelle (PeriodStatsTable.tsx). Bewusst unabhaengig vom Zeitraum-Query-
    Parameter des Haupt-Endpoints oben - die Tabelle zeigt immer die
    komplette Historie auf einmal, mit einem Dropdown im Frontend zum
    Wechseln zwischen Jahres- und Monatsansicht je Zeile."""
    ensure_can_access_athlete(athlete_id, current_user)
    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlet nicht gefunden")

    # Nur die ausgewerteten Spalten, siehe get_analytics oben.
    activities = (
        db.query(
            Activity.day,
            Activity.distance_m,
            Activity.duration_s,
            Activity.zone_km,
            Activity.effective_vo2max,
            Activity.target_zone,
        )
        .filter(Activity.athlete_id == athlete_id)
        .all()
    )
    inputs = [
        PeriodStatsInput(
            day=a.day,
            distance_m=a.distance_m,
            duration_s=a.duration_s,
            zone_km=a.zone_km or {},
            effective_vo2max=a.effective_vo2max,
            target_zone=a.target_zone,
        )
        for a in activities
    ]
    years = compute_period_stats(inputs)
    return PeriodStatsOut(
        years=[
            YearStatsOut(
                year=y.year,
                avg_km_per_week=y.avg_km_per_week,
                pct_ga1=y.pct_ga1,
                pct_schwelle=y.pct_schwelle,
                pct_vo2max=y.pct_vo2max,
                mean_effective_vo2max=y.mean_effective_vo2max,
                sonstige_avg_h_per_week=y.sonstige_avg_h_per_week,
                months=[
                    MonthStatsOut(
                        month=m.month,
                        avg_km_per_week=m.avg_km_per_week,
                        pct_ga1=m.pct_ga1,
                        pct_schwelle=m.pct_schwelle,
                        pct_vo2max=m.pct_vo2max,
                        mean_effective_vo2max=m.mean_effective_vo2max,
                        sonstige_avg_h_per_week=m.sonstige_avg_h_per_week,
                    )
                    for m in y.months
                ],
            )
            for y in years
        ]
    )
