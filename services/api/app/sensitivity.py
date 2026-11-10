"""Sensitivity analysis: re-price every route end-to-end at each grid point (never scale one quote linearly)."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from decimal import Decimal

from app.catalog.seed import CATALOG
from app.config import MODEL_VERSION, settings
from app.money import ONE, D, s
from app.provenance import Snapshot
from app.routing.engine import build_context, price_all
from app.routing.rank import sort_fastest, sort_most_received
from app.schemas import (
    ComparisonRequest,
    Crossover,
    HeatmapCell,
    RouteResult,
    SensitivityRequest,
    SensitivityResponse,
    Series,
    SeriesPoint,
)
from pydantic import ValidationError

from app.schemas import Overrides
from app.service import DISCLAIMER, ValidationProblem, validate

DEFAULT_AXIS_VALUES = {
    "network_fee_multiplier": ["0.5", "1", "2", "5", "10", "25"],
    "spread_bps": ["0", "10", "25", "50", "100", "200"],
    "depth_multiplier": ["0.02", "0.05", "0.1", "0.25", "0.5", "1"],
    "payout_delay_hours": ["0", "1", "4", "12", "24", "48"],
    "provider_fee_multiplier": ["0.5", "1", "1.5", "2", "3", "5"],
}
MAX_HEATMAP_CELLS = 60


class GridTooLarge(ValueError):
    pass


def _space(lo: Decimal, hi: Decimal, n: int, scale: str, ccy: str) -> list[str]:
    if n == 1 or lo == hi:
        return [s(lo)]
    pts = []
    for i in range(n):
        if scale == "log":
            v = lo * (hi / lo) ** (D(i) / D(n - 1))
        else:
            v = lo + (hi - lo) * D(i) / D(n - 1)
        pts.append(v)
    q = D(1) if ccy == "JPY" else D("0.01")
    # round to 2 significant-ish figures for readable axes, keep unique
    out = []
    for v in pts:
        mag = D(10) ** (len(str(int(v))) - 2) if v >= 100 else q
        r = (v / mag).to_integral_value() * mag
        r = max(r, q)
        if s(r) not in out:
            out.append(s(r))
    return out


def resolve_amounts(req: SensitivityRequest) -> list[str]:
    ccy = req.baseline.source_currency
    if req.amounts:
        try:
            vals = sorted({D(a) for a in req.amounts})
        except ArithmeticError as exc:
            raise GridTooLarge("amounts must be decimal numbers") from exc
        if any(v <= 0 for v in vals):
            raise GridTooLarge("amounts must be positive")
        return [s(v) for v in vals]
    scale = D(150) if ccy == "JPY" else ONE
    r = req.amount_range
    lo, hi = (D(r.min), D(r.max)) if r else (D(50) * scale, D(250000) * scale)
    if lo <= 0 or hi <= lo:
        raise GridTooLarge("amount_range must satisfy 0 < min < max")
    return _space(lo, hi, r.steps if r else 24, r.scale if r else "log", ccy)


def _variant(base: ComparisonRequest, amount: str, axis: str | None = None, value: str | None = None) -> ComparisonRequest:
    ov = base.overrides.model_copy(update={axis: value}) if axis else base.overrides
    return base.model_copy(update={"send_amount": amount, "overrides": ov})


def _check_amounts(base: ComparisonRequest, amounts: list[str], what: str) -> None:
    """Every grid amount must pass the same validation as a single comparison (positive, in band, minor units)."""
    for a in amounts:
        try:
            D(a)
            validate(base.model_copy(update={"send_amount": a}))
        except (ArithmeticError, ValueError) as exc:
            msg = exc.args[0] if isinstance(exc, ValidationProblem) else "must be a decimal number"
            raise GridTooLarge(f"{what} {a!r}: {msg}") from exc


def _check_axis_values(base: ComparisonRequest, axis: str, values: list[str]) -> None:
    """Heatmap values go through the same bounds as user overrides."""
    for v in values:
        try:
            Overrides.model_validate({**base.overrides.model_dump(), axis: v})
        except ValidationError as exc:
            raise GridTooLarge(f"heatmap value {v!r} for {axis}: {exc.errors()[0]['msg']}") from exc


def _best(routes: list[RouteResult], kind: str) -> RouteResult | None:
    pool = [r for r in routes if (r.type == "usdc") == (kind == "usdc")]
    ranked = sort_most_received(pool)
    return ranked[0] if ranked else None


def _point(amount: str, r: RouteResult | None) -> SeriesPoint:
    if r is None:
        return SeriesPoint(amount=amount, route_id=None, label=None, recipient_amount=None, all_in_cost_pct=None,
                           typical_minutes=None, eligible=False)
    return SeriesPoint(amount=amount, route_id=r.id, label=r.label, recipient_amount=r.recipient_amount,
                       all_in_cost_pct=r.all_in_cost_pct, typical_minutes=r.duration.typical, eligible=True)


def _classify(routes: list[RouteResult]) -> tuple[str, RouteResult | None, RouteResult | None, str | None, int | None]:
    """Compare USDC routes against the best conventional route (most received).

    "both" means a single USDC route delivers more *and* has a shorter known typical time; otherwise "cheaper" /
    "faster" can be met by different USDC routes (the cheapest one, or the fastest one). Returns
    (classification, usdc route shown, conventional route, cost advantage pct, time advantage minutes)."""
    c = _best(routes, "conv")
    usdc = sort_most_received([r for r in routes if r.type == "usdc"])
    if c is None or not usdc:
        return "unavailable", usdc[0] if usdc else None, c, None, None
    c_amt = D(c.recipient_amount)
    c_t = c.duration.typical if c.duration.known else None

    def faster(r: RouteResult) -> bool:
        return c_t is not None and r.duration.known and r.duration.typical < c_t

    both = next((r for r in usdc if D(r.recipient_amount) > c_amt and faster(r)), None)
    best = usdc[0]
    if both is not None:
        cls, u = "both", both
    elif D(best.recipient_amount) > c_amt:
        cls, u = "cheaper", best
    else:
        quick = next((r for r in sort_fastest(usdc) if faster(r)), None)
        cls, u = ("faster", quick) if quick is not None else ("neither", best)
    cost_adv = (s(D(c.all_in_cost_pct) - D(u.all_in_cost_pct), 4)
                if u.all_in_cost_pct is not None and c.all_in_cost_pct is not None else None)
    t_adv = c_t - u.duration.typical if c_t is not None and u.duration.known else None
    return cls, u, c, cost_adv, t_adv


def _crossovers(amounts: list[str], a: list[SeriesPoint], b: list[SeriesPoint], names: tuple[str, str]) -> list[Crossover]:
    out = []
    for metric in ("cost", "time"):
        prev = None
        for amt, pa, pb in zip(amounts, a, b, strict=True):
            if not (pa.eligible and pb.eligible):
                prev = None  # interpolate only between valid points
                continue
            if metric == "cost":
                diff = D(pa.all_in_cost_pct) - D(pb.all_in_cost_pct)
            else:
                if pa.typical_minutes is None or pb.typical_minutes is None:
                    prev = None
                    continue
                diff = D(pa.typical_minutes - pb.typical_minutes)
            if prev is not None and diff != 0 and prev[1] != 0 and (diff > 0) != (prev[1] > 0):
                x0, d0 = prev
                x1 = D(amt)
                x = x0 + (x1 - x0) * (d0 / (d0 - diff))
                winner = names[0] if diff < 0 else names[1]
                loser = names[1] if winner == names[0] else names[0]
                out.append(Crossover(metric=metric, amount=s(x, 2), between=list(names),
                                     description=f"Above ~{s(x, 0)}, {winner} beats {loser} on "
                                                 f"{'all-in cost' if metric == 'cost' else 'typical time'} "
                                                 f"(interpolated between {s(x0)} and {s(x1)})."))
            prev = (D(amt), diff)
    return out


def run(req: SensitivityRequest, snap: Snapshot, *, replay: bool = False) -> SensitivityResponse:
    base = req.baseline
    amounts = resolve_amounts(req)
    axis = req.heatmap_axis
    values = req.heatmap_values or (DEFAULT_AXIS_VALUES[axis] if axis else [])
    if axis:
        _check_axis_values(base, axis, values)
    hm_amounts = req.heatmap_amounts or (amounts[:: max(1, len(amounts) // 8)][:8] if axis else [])
    _check_amounts(base, amounts, "amount")
    _check_amounts(base, hm_amounts, "heatmap amount")
    cells = len(values) * len(hm_amounts)
    if len(amounts) > 40 or cells > MAX_HEATMAP_CELLS or len(amounts) + cells > settings.max_sensitivity_points:
        raise GridTooLarge(f"grid too large: {len(amounts)} amounts + {cells} heatmap cells "
                           f"(max {settings.max_sensitivity_points} points, {MAX_HEATMAP_CELLS} cells)")

    check = snap.data_mode == "live" and not replay
    now = datetime.now(UTC)

    def price(r: ComparisonRequest) -> list[RouteResult]:
        ctx = build_context(r, snap, CATALOG, check_freshness=check, now=now)
        ok, _ = price_all(ctx)
        return ok

    s_usdc, s_wise, s_bank, s_fast = [], [], [], []
    for a in amounts:
        routes = price(_variant(base, a))
        s_usdc.append(_point(a, _best(routes, "usdc")))
        s_wise.append(_point(a, next((r for r in routes if r.id == "conv:wise"), None)))
        s_bank.append(_point(a, next((r for r in routes if r.id == "conv:bank_swift"), None)))
        fast = sort_fastest([r for r in routes if r.type == "usdc"])
        s_fast.append(_point(a, fast[0] if fast else None))

    best_conv = [
        (w if (w.eligible and (not b.eligible or D(w.recipient_amount) >= D(b.recipient_amount))) else b)
        for w, b in zip(s_wise, s_bank, strict=True)
    ]
    crossovers = _crossovers(amounts, s_usdc, best_conv, ("best USDC route", "best conventional route"))

    heat = []
    for v in values:
        for a in hm_amounts:
            cls, u, c, cost_adv, t_adv = _classify(price(_variant(base, a, axis, v)))
            heat.append(HeatmapCell(amount=a, axis_value=v, classification=cls, cost_advantage_pct=cost_adv,
                                    time_advantage_minutes=t_adv, best_usdc_route_id=u.id if u else None,
                                    best_conventional_route_id=c.id if c else None))

    return SensitivityResponse(
        id=f"sens_{secrets.token_urlsafe(12)}", created_at=datetime.now(UTC), model_version=MODEL_VERSION, request=req,
        snapshot=snap.meta(), amounts=amounts,
        series=[Series(key="best_usdc", label="Best USDC route (most received)", points=s_usdc),
                Series(key="fastest_usdc", label="Fastest USDC route", points=s_fast),
                Series(key="wise", label="Wise (assumed tariff unless API configured)", points=s_wise),
                Series(key="bank_swift", label="Bank SWIFT wire (assumed)", points=s_bank)],
        crossovers=crossovers,
        no_crossover_note=None if crossovers else "No crossover in tested range.",
        heatmap_axis=axis, heatmap_values=values, heatmap_amounts=hm_amounts, heatmap=heat,
        points_computed=len(amounts) + cells,
        is_simulation=True, disclaimer=DISCLAIMER + " Sensitivity points are simulations on one data snapshot.",
    )
