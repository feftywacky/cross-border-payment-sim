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


def sort_fastest(routes: list[RouteResult]) -> list[RouteResult]:
    known = [r for r in routes if r.duration.known]
    return sorted(known, key=lambda r: (r.duration.typical, -_amt(r), *_tiebreak(r)))


def pareto(routes: list[RouteResult]) -> list[str]:
    known = [r for r in routes if r.duration.known]
    front = []
    for r in known:
        dominated = any(
            (_amt(o) >= _amt(r) and o.duration.typical <= r.duration.typical)
            and (_amt(o) > _amt(r) or o.duration.typical < r.duration.typical)
            for o in known
        )
        if not dominated:
            front.append(r)
    return [r.id for r in sorted(front, key=lambda r: r.duration.typical)]


def fmt_minutes(m: int | None) -> str:
    if m is None:
        return "unknown"
    if m < 60:
        return f"{m} min"
    if m < 60 * 48:
        h, mm = divmod(m, 60)
        return f"{h} h {mm} min" if mm else f"{h} h"
    return f"{m / 1440:.1f} days"


def select(routes: list[RouteResult], objective: Objective, deadline: int | None):
    """Return (recommended, most_received, fastest, reason)."""
    most = sort_most_received(routes)
    fast = sort_fastest(routes)
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
        reason = f"Fastest known typical completion ({fmt_minutes(rec.duration.typical)})."
    else:
        if deadline is None:
            return None, most_r, fast_r, "Enter a time limit to use the within-deadline objective."
        within = [r for r in most if r.duration.known and r.duration.typical <= deadline]
        if not within:
            return None, most_r, fast_r, (f"No route with a known typical time within {fmt_minutes(deadline)}. "
                                          f"Fastest known is {fmt_minutes(fast_r.duration.typical) if fast_r else 'n/a'}.")
        rec = within[0]
        reason = (f"Delivers the most among routes with typical time ≤ {fmt_minutes(deadline)} "
                  f"({rec.recipient_amount} {rec.recipient_currency}, {fmt_minutes(rec.duration.typical)}).")

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
                   f"({fmt_minutes(most_r.duration.typical)} vs {fmt_minutes(fast_r.duration.typical)}).")
    if not rec.duration.known:
        reason += " Its completion time is unknown."
    if rec.recommendation_grade == "research":
        reason += " Research scenario: some legs rely on assumptions or unreviewed tariffs."
    return rec, most_r, fast_r, reason
