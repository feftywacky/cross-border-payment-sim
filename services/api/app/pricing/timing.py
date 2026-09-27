"""End-to-end completion time: from sender starting funding until the recipient can use target fiat.

Legs are simulated sequentially from a concrete start time for each of the min / typical / max scenarios, so
bank business hours and weekends push later legs out. Public holidays are not modelled (documented gap)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.catalog.models import Calendar, Timing


@dataclass
class TimedLeg:
    timing: Timing
    calendar: Calendar | None
    extra_hours: float = 0.0  # scenario delay (always elapsed wall-clock)
    material: bool = True


def next_open(t: datetime, cal: Calendar) -> datetime:
    """t if inside the business window, else the next window opening."""
    tz = ZoneInfo(cal.tz)
    local = t.astimezone(tz)
    for _ in range(15):
        if local.weekday() in cal.weekdays:
            open_ = local.replace(hour=cal.open_hour, minute=0, second=0, microsecond=0)
            close = local.replace(hour=cal.close_hour, minute=0, second=0, microsecond=0)
            if local < open_:
                return open_.astimezone(t.tzinfo)
            if local < close:
                return t
        local = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(t.tzinfo)  # pragma: no cover


def _add_business_minutes(t: datetime, minutes: int, cal: Calendar) -> datetime:
    t = next_open(t, cal)
    tz = ZoneInfo(cal.tz)
    remaining = timedelta(minutes=minutes)
    while remaining > timedelta(0):
        local = t.astimezone(tz)
        close = local.replace(hour=cal.close_hour, minute=0, second=0, microsecond=0)
        available = close - local
        if remaining <= available:
            return t + remaining
        remaining -= available
        t = next_open(close.astimezone(t.tzinfo) + timedelta(seconds=1), cal)
    return t


def _add_business_days(t: datetime, days: int, cal: Calendar) -> datetime:
    t = next_open(t, cal)
    if days == 0:
        return _add_business_minutes(t, 120, cal)  # same business day: assume ~2 business hours
    tz = ZoneInfo(cal.tz)
    local = t.astimezone(tz)
    added = 0
    while added < days:
        local += timedelta(days=1)
        if local.weekday() in cal.weekdays:
            added += 1
    return local.astimezone(t.tzinfo)


def advance(t: datetime, leg: TimedLeg, which: str) -> datetime | None:
    value = getattr(leg.timing, which)
    if value is None:
        return None
    cal = leg.calendar
    if leg.timing.unit == "business_days":
        if cal is None:
            t = t + timedelta(days=value * 7 / 5)
        else:
            t = _add_business_days(t, value, cal)
    elif cal is not None:
        t = _add_business_minutes(t, value, cal)
    else:
        t = t + timedelta(minutes=value)
    return t + timedelta(hours=leg.extra_hours)


def simulate(start: datetime, legs: list[TimedLeg]) -> dict:
    """Return {'min','typical','max'} minutes (None if any material leg unknown) and typical arrival."""
    out: dict = {}
    arrival = None
    for which in ("min", "typical", "max"):
        t: datetime | None = start
        for leg in legs:
            nt = advance(t, leg, which) if t is not None else None
            if nt is None and leg.material:
                t = None
                break
            t = nt if nt is not None else t
        out[which] = None if t is None else int((t - start).total_seconds() // 60)
        if which == "typical":
            arrival = t
    # Guard monotonicity (a later start window can reorder scenarios only through calendar effects).
    vals = [v for v in out.values() if v is not None]
    if len(vals) == 3:
        out["min"], out["max"] = min(vals), max(vals)
    out["known"] = len(vals) == 3
    out["arrival"] = arrival
    return out
