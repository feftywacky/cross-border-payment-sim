from decimal import Decimal as D

import pytest

from app import sensitivity
from app.schemas import ComparisonRequest, SensitivityRequest, SeriesPoint


def base():
    return ComparisonRequest(source_country="CA", source_currency="CAD", destination_country="DE",
                             destination_currency="EUR", send_amount="1000")


def pt(a, cost, mins=10, ok=True):
    return SeriesPoint(amount=a, route_id="x", label="x", recipient_amount="1", all_in_cost_pct=cost,
                       typical_minutes=mins, eligible=ok)


def test_crossover_interpolation():
    amts = ["100", "200", "300"]
    a = [pt("100", "5"), pt("200", "2"), pt("300", "1")]
    b = [pt("100", "3"), pt("200", "3"), pt("300", "3")]
    xs = sensitivity._crossovers(amts, a, b, ("usdc", "conv"))
    cost = [x for x in xs if x.metric == "cost"]
    assert len(cost) == 1
    # diff: +2 at 100, -1 at 200 -> zero at 100 + 100*2/3
    assert D(cost[0].amount) == D("166.67")
    assert "usdc beats conv" in cost[0].description


def test_no_interpolation_across_invalid_points():
    amts = ["100", "200", "300"]
    a = [pt("100", "5"), pt("200", None, ok=False), pt("300", "1")]
    b = [pt("100", "3"), pt("200", "3"), pt("300", "3")]
    assert [x for x in sensitivity._crossovers(amts, a, b, ("u", "c")) if x.metric == "cost"] == []


def test_grid_limit(synthetic_snapshot):
    r = SensitivityRequest(baseline=base(), amounts=[str(i) for i in range(10, 410, 10)],
                           heatmap_values=["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
                           heatmap_amounts=["1", "2", "3", "4", "5", "6", "7"])
    with pytest.raises(sensitivity.GridTooLarge):
        sensitivity.run(r, synthetic_snapshot())


def test_sweep_reprices_every_point(synthetic_snapshot):
    r = SensitivityRequest(baseline=base(), amount_range={"min": "20", "max": "100000", "steps": 12},
                           heatmap_axis="network_fee_multiplier")
    out = sensitivity.run(r, synthetic_snapshot(), replay=True)
    assert out.points_computed <= 100
    usdc = next(s for s in out.series if s.key == "best_usdc")
    costs = [D(p.all_in_cost_pct) for p in usdc.points if p.eligible]
    assert len(set(costs)) > 1  # each point re-priced (limits switch rails), not a scaled single quote
    wire = next(s for s in out.series if s.key == "bank_swift")
    assert not wire.points[0].eligible  # 45 CAD fee exceeds a 20 CAD send: excluded, not negative
    ok = [D(p.all_in_cost_pct) for p in wire.points if p.eligible]
    assert ok[0] > ok[-1]  # fixed fees dominate small amounts
    assert {c.classification for c in out.heatmap} <= {"cheaper", "faster", "both", "neither", "unavailable"}
    assert out.crossovers or out.no_crossover_note == "No crossover in tested range."
