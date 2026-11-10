"""Comparison orchestration: validate -> snapshot -> price -> rank."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from app.adapters.fx import boc_cross_check, reference_rate
from app.catalog.seed import CATALOG
from app.config import MODEL_VERSION, settings
from app.money import D, s
from app.provenance import Snapshot, build_snapshot
from app.routing.engine import build_context, price_all
from app.routing.rank import pareto, select
from app.schemas import ComparisonRequest, ComparisonResponse, ReferenceFx

DISCLAIMER = ("Simulation / estimate, not a payment quote. No money is moved and no orders are placed. "
              "Public order books, tariffs and delivery times can change before any real transaction.")
MAX_AMOUNT = D("1000000")


class ValidationProblem(ValueError):
    pass


def validate(req: ComparisonRequest) -> None:
    cat = CATALOG
    for field, country, ccy in (("source", req.source_country, req.source_currency),
                                ("destination", req.destination_country, req.destination_currency)):
        c = cat.countries.get(country)
        if c is None:
            raise ValidationProblem(f"{field}_country {country} is not supported")
        if ccy != c.currency:
            raise ValidationProblem(f"{field}_currency must be {c.currency} for {c.name}")
    amt = D(req.send_amount)
    if amt <= 0:
        raise ValidationProblem("send_amount must be positive")
    if amt > MAX_AMOUNT * (D(200) if req.source_currency == "JPY" else D(1)):
        raise ValidationProblem("send_amount exceeds the configured simulation band")
    if req.source_currency == "JPY" and amt != amt.to_integral_value():
        raise ValidationProblem("JPY amounts have no minor units")
    for field, country, method in (("funding_method", req.source_country, req.funding_method),
                                   ("payout_method", req.destination_country, req.payout_method)):
        if method != "any_bank" and method not in cat.countries[country].rails:
            raise ValidationProblem(f"{field} {method} is not available in {country}")
    if req.objective == "WITHIN_DEADLINE" and req.deadline_minutes is None:
        raise ValidationProblem("deadline_minutes is required for WITHIN_DEADLINE")
    if req.source_country == req.destination_country:
        raise ValidationProblem("source and destination country must differ (cross-border only)")


async def snapshot_for(req: ComparisonRequest) -> Snapshot:
    return await build_snapshot({req.source_currency, req.destination_currency},
                                wise_quote=(req.source_currency, req.destination_currency, req.send_amount))


def compare(req: ComparisonRequest, snap: Snapshot, *, replay: bool = False,
            now: datetime | None = None) -> ComparisonResponse:
    check = snap.data_mode == "live" and not replay
    if req.start_time is None:  # pin the start so a stored run replays deterministically
        req = req.model_copy(update={"start_time": snap.created_at})
    ctx = build_context(req, snap, CATALOG, check_freshness=check, now=now)
    ok, bad = price_all(ctx)
    rec, most, fast, reason = select(ok, req.objective, req.deadline_minutes, req.time_basis)

    warnings = []
    if snap.data_mode == "fixture":
        warnings.append("Fixture mode: recorded market payloads replayed; not current prices.")
    if replay:
        warnings.append("Replay of a stored snapshot; prices are historical.")
    if not req.overrides.is_default():
        warnings.append("Scenario overrides active: results are counterfactual simulations.")
    if req.source_currency == "JPY" or req.destination_currency == "JPY":
        warnings.append("No catalogued venue offers a USDC/JPY book; JPY USDC legs are unavailable.")

    ref = None
    rate, ids, how = reference_rate(snap.observations, req.source_currency, req.destination_currency)
    if rate is not None:
        obs = [snap.observations[i] for i in ids]
        observed = min((o.observed_at for o in obs if o.observed_at), default=None)
        boc = boc_cross_check(snap.observations, req.source_currency, req.destination_currency)
        cross = None
        if boc is not None:
            cross = {"source": "Bank of Canada Valet", "rate": s(boc, 8),
                     "diff_bps": s((boc / rate - 1) * 10000, 2)}
        ref = ReferenceFx(rate=s(rate, 10), unit=f"{req.destination_currency} per {req.source_currency}",
                          base=req.source_currency, quote=req.destination_currency, observed_at=observed,
                          source_ids=ids, derivation=how, status="live_api" if ids else "unavailable",
                          cross_check=cross)
    else:
        warnings.append("Reference FX unavailable: cost vs mid-rate cannot be computed; conventional estimates excluded.")

    ok_sorted = sorted(ok, key=lambda r: -D(r.recipient_amount))
    return ComparisonResponse(
        id=f"cmp_{secrets.token_urlsafe(12)}", created_at=datetime.now(UTC), model_version=MODEL_VERSION,
        catalog_version=CATALOG.version, request=req, snapshot=snap.meta(), reference_fx=ref, routes=ok_sorted,
        excluded=bad, recommended_route_id=rec.id if rec else None, recommendation_reason=reason,
        recommendation_grade=rec.recommendation_grade if rec else None,
        most_received_route_id=most.id if most else None, fastest_route_id=fast.id if fast else None,
        pareto_route_ids=pareto(ok, req.time_basis), is_simulation_override=not req.overrides.is_default(),
        source_errors=snap.errors, warnings=warnings, disclaimer=DISCLAIMER,
    )


def data_mode() -> str:
    return settings.data_mode
