from decimal import Decimal as D

from app.schemas import ComparisonRequest, Overrides
from app.service import compare

from .conftest import NOW


def req(amount="2500", **kw):
    base = dict(source_country="CA", source_currency="CAD", destination_country="DE", destination_currency="EUR",
                send_amount=amount)
    base.update(kw)
    return ComparisonRequest(**base)


def by_id(resp, rid):
    return next(r for r in resp.routes + resp.excluded if r.id == rid)


def test_reference_formulas_and_fee_reconciliation(synthetic_snapshot):
    resp = compare(req(), synthetic_snapshot(), now=NOW)
    R = D(resp.reference_fx.rate)
    assert R == D("1") / D("1.6")
    for r in resp.routes:
        A = D("2500")
        rec = D(r.recipient_amount)
        assert D(r.total_cost_source) == (A - rec / R).quantize(D("0.0001"))
        assert D(r.all_in_cost_pct) == (100 * (1 - rec / (A * R))).quantize(D("0.0001"))
        assert D(r.effective_rate) == (rec / A).quantize(D("0.00000001"))
        # fee breakdown reconciles to the all-in cost exactly once (no double counting)
        total = sum(D(f.amount_source) for f in r.fee_breakdown if f.amount_source is not None)
        assert abs(total - D(r.total_cost_source)) <= D("0.0002"), r.id


def test_usdc_leg_sequence_and_book_sides(synthetic_snapshot):
    resp = compare(req(), synthetic_snapshot(), now=NOW)
    r = by_id(resp, "usdc:kraken:ca_wire:solana:bitstamp:sepa")
    kinds = [leg.kind for leg in r.legs]
    assert kinds == ["funding", "trade", "withdrawal", "network", "deposit", "trade", "payout"]
    assert "walk asks" in r.legs[1].detail["side"]
    assert "walk bids" in r.legs[5].detail["side"]
    # custodial withdrawal fee charged; gas NOT charged separately on the network leg
    assert D(r.legs[2].fee) == D("0.9") and r.legs[2].fee_unit == "USDC"
    assert D(r.legs[3].fee) == 0
    cats = [f.category for f in r.fee_breakdown]
    assert "network" not in cats and cats.count("withdrawal") == 1


def test_inverse_pair_route_via_binance(synthetic_snapshot):
    resp = compare(req(), synthetic_snapshot(), now=NOW)
    r = by_id(resp, "usdc:kraken:ca_wire:solana:binance:sepa")
    assert r.eligible
    sell = r.legs[5]
    assert sell.detail["book_orientation"].startswith("inverse")
    assert "walk asks" in sell.detail["side"]  # spending USDC buys base EUR


def test_two_account_requirement_and_hold(synthetic_snapshot):
    resp = compare(req(), synthetic_snapshot(), now=NOW)
    r = by_id(resp, "usdc:kraken:interac_etransfer:solana:bitstamp:sepa")
    assert any("separate verified" in p for p in r.prerequisites)
    assert any("own name" in p for p in r.prerequisites)
    # Kraken documents no withdrawal hold for Interac e-Transfer deposits.
    assert not [leg for leg in r.legs if leg.kind == "hold"]
    from app.catalog.seed import KRAKEN

    ach = next(t for t in KRAKEN.fiat["USD"].deposit if t.rail == "ach")
    assert ach.crypto_withdrawal_hold.typical == 10080  # Kraken: 7-day hold on Plaid ACH deposits


def test_fixed_fee_dominance_small_amount(synthetic_snapshot):
    small = compare(req("100"), synthetic_snapshot(), now=NOW)
    large = compare(req("50000"), synthetic_snapshot(), now=NOW)
    wire_s, wire_l = by_id(small, "conv:bank_swift"), by_id(large, "conv:bank_swift")
    assert D(wire_s.all_in_cost_pct) > D("50")
    assert D(wire_l.all_in_cost_pct) < D("4")


def test_limits_and_unavailable(synthetic_snapshot):
    resp = compare(req("20000"), synthetic_snapshot(), now=NOW)
    over = by_id(resp, "usdc:kraken:interac_etransfer:solana:bitstamp:sepa")
    assert not over.eligible and over.exclusion_codes == ["OVER_LIMIT"]
    codes = {c for r in resp.excluded for c in r.exclusion_codes}
    assert "VENUE_UNAVAILABLE_IN_COUNTRY" in codes  # e.g. Binance/Bybit/OKX in CA
    assert "NOT_NATIVE_USDC" in codes  # TRON / BNB chain


def test_jpy_explains_missing_stablecoin_legs(synthetic_snapshot):
    snap = synthetic_snapshot()
    resp = compare(req(destination_country="JP", destination_currency="JPY"), snap, now=NOW)
    assert all(r.type != "usdc" for r in resp.routes)
    assert any("USDC/JPY" in w for w in resp.warnings)
    assert any(c in ("NO_FIAT_SUPPORT", "VENUE_UNAVAILABLE_IN_COUNTRY") for r in resp.excluded for c in r.exclusion_codes)
    assert by_id(resp, "conv:wise").eligible


def test_stale_book_rejected_in_current_mode(synthetic_snapshot):
    from datetime import timedelta

    resp = compare(req(), synthetic_snapshot(), now=NOW + timedelta(minutes=10))
    assert all(r.type != "usdc" for r in resp.routes)
    assert any("STALE_PRICE" in r.exclusion_codes for r in resp.excluded)


def test_missing_book_is_unavailable_not_invented(synthetic_snapshot):
    snap = synthetic_snapshot()
    del snap.observations["book:bitstamp:usdceur"]
    resp = compare(req(), snap, now=NOW)
    assert not any(r.destination_venue == "bitstamp" for r in resp.routes)
    ex = by_id(resp, "usdc:bitstamp:recipient")
    assert ex.exclusion_codes == ["SOURCE_UNAVAILABLE"]


def test_congestion_reranks_networks(synthetic_snapshot):
    base = compare(req("300"), synthetic_snapshot(), now=NOW)
    usdc = [r for r in base.routes if r.type == "usdc"]
    stressed = compare(req("300", overrides=Overrides(network_fee_multiplier="50")), synthetic_snapshot(), now=NOW)
    assert stressed.is_simulation_override
    a = by_id(base, "usdc:kraken:ca_wire:ethereum:bitstamp:sepa")
    b = by_id(stressed, "usdc:kraken:ca_wire:ethereum:bitstamp:sepa")
    assert D(b.recipient_amount) < D(a.recipient_amount)
    assert usdc and stressed.recommended_route_id is not None


def test_objectives(synthetic_snapshot):
    snap = synthetic_snapshot()
    fastest = compare(req(objective="FASTEST"), snap, now=NOW)
    rec = by_id(fastest, fastest.recommended_route_id)
    assert rec.duration.known
    assert rec.duration.typical == min(r.duration.typical for r in fastest.routes if r.duration.known)
    dl = compare(req(objective="WITHIN_DEADLINE", deadline_minutes=240), snap, now=NOW)
    if dl.recommended_route_id:
        assert by_id(dl, dl.recommended_route_id).duration.typical <= 240
    assert set(fastest.pareto_route_ids) <= {r.id for r in fastest.routes}


def test_research_grade_when_unreviewed(synthetic_snapshot):
    resp = compare(req(), synthetic_snapshot(), now=NOW)
    assert resp.recommendation_grade == "research"
    assert all(r.recommendation_grade == "research" for r in resp.routes if r.type != "usdc")


def test_deterministic(synthetic_snapshot):
    a = compare(req(), synthetic_snapshot(), now=NOW)
    b = compare(req(), synthetic_snapshot(), now=NOW)
    assert [(r.id, r.recipient_amount, r.duration.typical) for r in a.routes] == \
           [(r.id, r.recipient_amount, r.duration.typical) for r in b.routes]


def test_time_basis_changes_fastest_ranking(synthetic_snapshot):
    from app.routing.rank import sort_fastest, time_of

    resp = compare(req(), synthetic_snapshot(), now=NOW)
    ok = [r for r in resp.routes if r.eligible]
    e2e = sort_fastest(ok, "END_TO_END")[0]
    conv = sort_fastest(ok, "CONVERSION")[0]
    assert time_of(conv, "CONVERSION").typical <= time_of(e2e, "CONVERSION").typical
    assert time_of(e2e, "END_TO_END").typical <= time_of(conv, "END_TO_END").typical
    by_conv = compare(req(objective="FASTEST", time_basis="CONVERSION"), synthetic_snapshot(), now=NOW)
    assert by_conv.recommended_route_id == conv.id
