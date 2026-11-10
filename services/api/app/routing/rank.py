"""Objective ranking, Pareto frontier and recommendation text."""

from __future__ import annotations

from decimal import Decimal

from app.money import D
from app.schemas import Objective, RouteResult

QUALITY_ORDER = {"live": 0, "mixed": 1, "assumed": 2}


def _amt(r: RouteResult) -> Decimal:
    return D(r.recipient_amount) if r.recipient_amount is not None else D("-1")


def _tiebreak(r: RouteResult):
    return (QUALITY_ORDER[r.input_quality], 0 if r.recommendation_grade == "current" else 1, r.id)


def sort_most_received(routes: list[RouteResult]) -> list[RouteResult]:
    return sorted(routes, key=lambda r: (-_amt(r), *_tiebreak(r)))


def time_of(r: RouteResult, basis: str = "END_TO_END"):
    """The Duration used for ranking: whole transfer, or just the conversion phase."""
    if basis == "CONVERSION" and r.timing_split is not None:
        return r.timing_split.conversion
    return r.duration


def sort_fastest(routes: list[RouteResult], basis: str = "END_TO_END") -> list[RouteResult]:
    known = [r for r in routes if time_of(r, basis).known]
    return sorted(known, key=lambda r: (time_of(r, basis).typical, -_amt(r), *_tiebreak(r)))


def pareto(routes: list[RouteResult], basis: str = "END_TO_END") -> list[str]:
    known = [r for r in routes if time_of(r, basis).known]
    front = []
    for r in known:
        dominated = any(
            (_amt(o) >= _amt(r) and time_of(o, basis).typical <= time_of(r, basis).typical)
            and (_amt(o) > _amt(r) or time_of(o, basis).typical < time_of(r, basis).typical)
            for o in known
        )
        if not dominated:
            front.append(r)
    return [r.id for r in sorted(front, key=lambda r: time_of(r, basis).typical)]


def fmt_minutes(m: int | None) -> str:
    if m is None:
        return "unknown"
    if m < 60:
        return f"{m} min"
    if m < 60 * 48:
        h, mm = divmod(m, 60)
        return f"{h} h {mm} min" if mm else f"{h} h"
    return f"{m / 1440:.1f} days"


def select(routes: list[RouteResult], objective: Objective, deadline: int | None, basis: str = "END_TO_END"):
    """Return (recommended, most_received, fastest, reason)."""
    most = sort_most_received(routes)
    fast = sort_fastest(routes, basis)
    label = "conversion" if basis == "CONVERSION" else "completion"
    most_r = most[0] if most else None
    fast_r = fast[0] if fast else None
    if not routes:
        return None, None, None, "No eligible route for these inputs; see excluded routes for reasons."

    if objective == "MOST_RECEIVED":
        rec = most_r
        reason = f"Delivers the most ({rec.recipient_amount} {rec.recipient_currency})."
    elif objective == "FASTEST":
        if fast_r is None:
            return None, most_r, None, "No eligible route has a known completion time; no fastest-route claim is made."
        rec = fast_r
        reason = f"Fastest known typical {label} ({fmt_minutes(time_of(rec, basis).typical)})."
    else:
        if deadline is None:
            return None, most_r, fast_r, "Enter a time limit to use the within-deadline objective."
        within = [r for r in most if time_of(r, basis).known and time_of(r, basis).typical <= deadline]
        if not within:
            return None, most_r, fast_r, (f"No route with a known typical time within {fmt_minutes(deadline)}. "
                                          f"Fastest known is {fmt_minutes(time_of(fast_r, basis).typical) if fast_r else 'n/a'}.")
        rec = within[0]
        reason = (f"Delivers the most among routes with typical time ≤ {fmt_minutes(deadline)} "
                  f"({rec.recipient_amount} {rec.recipient_currency}, {fmt_minutes(time_of(rec, basis).typical)}).")

    conv = [r for r in most if r.type != "usdc"]
    usdc = [r for r in most if r.type == "usdc"]
    if rec.type == "usdc" and conv:
        diff = _amt(rec) - _amt(conv[0])
        reason += f" {diff:+.2f} {rec.recipient_currency} vs best conventional route ({conv[0].label})."
    elif rec.type != "usdc" and usdc:
        diff = _amt(rec) - _amt(usdc[0])
        reason += f" {diff:+.2f} {rec.recipient_currency} vs best USDC route."
    if most_r and fast_r and most_r.id != fast_r.id and rec.id == most_r.id:
        reason += (f" The cheapest route is slower than the fastest known route "
                   f"({fmt_minutes(time_of(most_r, basis).typical)} vs {fmt_minutes(time_of(fast_r, basis).typical)}).")
    if not time_of(rec, basis).known:
        reason += " Its completion time is unknown."
    if rec.recommendation_grade == "research":
        reason += " Research scenario: some legs rely on assumptions or unreviewed tariffs."
    return rec, most_r, fast_r, reason
