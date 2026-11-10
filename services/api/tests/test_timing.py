from datetime import UTC, datetime

from app.catalog.models import Calendar, Timing
from app.pricing.timing import TimedLeg, next_open, simulate

EU = Calendar("eu_bank", "Europe/Berlin", 8, 17)


def test_weekend_defers_business_leg():
    sat = datetime(2026, 9, 26, 12, 0, tzinfo=UTC)  # Saturday
    assert next_open(sat, EU).isoformat() == "2026-09-28T06:00:00+00:00"  # Monday 08:00 CEST


def test_business_days_and_minutes():
    tue = datetime(2026, 9, 29, 10, 0, tzinfo=UTC)
    legs = [TimedLeg(Timing(5, 30, 60), None), TimedLeg(Timing(0, 1, 2, unit="business_days"), EU)]
    r = simulate(tue, legs)
    assert r["known"] and r["min"] < r["typical"] < r["max"]
    assert r["typical"] == 30 + 24 * 60  # next business day, same clock time


def test_friday_evening_rolls_to_monday():
    fri = datetime(2026, 10, 2, 17, 30, tzinfo=UTC)  # 19:30 Berlin, after close
    r = simulate(fri, [TimedLeg(Timing(10, 10, 10), EU)])
    assert r["typical"] == (datetime(2026, 10, 5, 6, 10, tzinfo=UTC) - fri).total_seconds() // 60


def test_unknown_material_leg_makes_route_unknown():
    r = simulate(datetime(2026, 9, 29, tzinfo=UTC), [TimedLeg(Timing(1, 1, 1), None), TimedLeg(Timing(None, None, None), None)])
    assert r["known"] is False and r["typical"] is None


def test_scenario_delay_added():
    t0 = datetime(2026, 9, 29, 10, tzinfo=UTC)
    r = simulate(t0, [TimedLeg(Timing(10, 10, 10), None, extra_hours=2)])
    assert r["typical"] == 130


def test_phase_split_sums_to_total_and_attributes_weekend_wait_to_rails():
    fri = datetime(2026, 10, 2, 17, 30, tzinfo=UTC)  # after EU close -> payout waits until Monday
    legs = [TimedLeg(Timing(5, 30, 60), None, phase="conversion"),
            TimedLeg(Timing(10, 10, 10), EU, phase="rails")]
    r = simulate(fri, legs)
    ph = r["phases"]
    assert ph["conversion"]["typical"] == 30
    assert ph["rails"]["typical"] + ph["conversion"]["typical"] == r["typical"]
    assert ph["rails"]["typical"] > 24 * 60  # weekend wait lands on the bank leg, not the crypto leg
