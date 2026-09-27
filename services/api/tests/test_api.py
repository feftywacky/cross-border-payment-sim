"""End-to-end API happy path against recorded real payloads (DATA_MODE=fixture)."""

from decimal import Decimal as D

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def body(src="CA", sc="CAD", dst="DE", dc="EUR", amount="2500", **kw):
    return {"source_country": src, "source_currency": sc, "destination_country": dst, "destination_currency": dc,
            "send_amount": amount, **kw}


def test_health_and_catalog(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    cat = client.get("/api/v1/catalog").json()
    assert {v["id"] for v in cat["venues"]} == {"kraken", "coinbase", "bitstamp", "binance", "okx", "bybit"}
    nets = {n["id"]: n for n in cat["networks"]}
    assert nets["solana"]["native_usdc"] and not nets["tron"]["native_usdc"]
    cadeur = next(c for c in cat["corridors"] if c["source_country"] == "CA" and c["destination_country"] == "DE")
    assert cadeur["usdc"]
    cajp = next(c for c in cat["corridors"] if c["source_country"] == "CA" and c["destination_country"] == "JP")
    assert not cajp["usdc"] and "JPY" in cajp["explanation"]
    assert cat["default_corridor"] == {"source_country": "CA", "destination_country": "DE"}


@pytest.mark.parametrize("corridor", [("CA", "CAD", "DE", "EUR"), ("US", "USD", "GB", "GBP")])
@pytest.mark.parametrize("amount", ["150", "5000", "150000"])
def test_release_gate_reproducible(client, corridor, amount):
    src, sc, dst, dc = corridor
    r = client.post("/api/v1/comparisons", json=body(src, sc, dst, dc, amount))
    assert r.status_code == 200, r.text
    data = r.json()
    assert "not a payment quote" in data["disclaimer"]
    assert data["snapshot"]["data_mode"] == "fixture"
    assert isinstance(data["routes"][0]["recipient_amount"], str)  # decimal strings, not floats
    kinds = {x["type"] for x in data["routes"]}
    assert "conventional_provider" in kinds
    # reproduce every displayed recipient amount from stored inputs
    sc_ = client.post("/api/v1/scenarios", json={"comparison_id": data["id"]}).json()
    replay = client.get(f"/api/v1/scenarios/{sc_['id']}/replay").json()
    assert [(x["id"], x["recipient_amount"], x["duration"]) for x in replay["routes"]] == \
           [(x["id"], x["recipient_amount"], x["duration"]) for x in data["routes"]]


def test_rerank_after_amount_or_congestion(client):
    small = client.post("/api/v1/comparisons", json=body(amount="40")).json()
    big = client.post("/api/v1/comparisons", json=body(amount="100000")).json()
    assert small["recommended_route_id"] != big["recommended_route_id"]
    base = client.post("/api/v1/comparisons", json=body(amount="500")).json()
    cong = client.post("/api/v1/comparisons",
                       json=body(amount="500", overrides={"network_fee_multiplier": "40"})).json()
    assert cong["is_simulation_override"]
    order = lambda d: [x["id"] for x in d["routes"]]  # noqa: E731
    assert order(base) != order(cong)


def test_validation_errors(client):
    assert client.post("/api/v1/comparisons", json=body(sc="EUR")).status_code == 422
    assert client.post("/api/v1/comparisons", json=body(amount="-5")).status_code == 422
    assert client.post("/api/v1/comparisons", json=body(amount="abc")).status_code == 422
    assert client.post("/api/v1/comparisons", json=body(funding_method="ach")).status_code == 422
    assert client.post("/api/v1/comparisons", json=body(objective="WITHIN_DEADLINE")).status_code == 422


def test_sensitivity_scenario_export(client):
    comp = client.post("/api/v1/comparisons", json=body()).json()
    sens = client.post("/api/v1/analyses/sensitivity",
                       json={"baseline": body(), "amount_range": {"min": "50", "max": "100000", "steps": 16}}).json()
    assert sens["points_computed"] <= 100 and len(sens["series"]) == 4
    sc = client.post("/api/v1/scenarios", json={"comparison_id": comp["id"], "sensitivity_id": sens["id"],
                                                "label": "CAD->EUR"}).json()
    assert len(sc["id"]) > 20 and sc["share_path"].startswith("/s/")
    got = client.get(f"/api/v1/scenarios/{sc['id']}").json()
    assert got["created_at"].endswith(("Z", "+00:00"))  # timezone-aware UTC
    assert got["comparison"]["id"] == comp["id"] and got["sensitivity"]["id"] == sens["id"]
    csv = client.get(f"/api/v1/scenarios/{sc['id']}/export?format=csv")
    assert csv.status_code == 200 and csv.text.startswith("section,")
    assert "sweep:best_usdc" in csv.text and "heatmap" in csv.text
    js = client.get(f"/api/v1/scenarios/{sc['id']}/export?format=json").json()
    assert js["comparison"]["snapshot"]["id"]
    assert client.get("/api/v1/scenarios/sc_nope").status_code == 404


def test_sources_status_no_secrets(client):
    st = client.get("/api/v1/sources/status").json()
    wise = next(a for a in st["adapters"] if a["source_id"] == "wise:quote")
    assert wise["credentials_configured"] is False
    assert st["tariffs_total"] > 50
    assert "bearer" not in str(st).lower() and "api_key" not in str(st).lower()


def test_negative_cost_explained_as_value(client):
    data = client.post("/api/v1/comparisons", json=body(amount="5000")).json()
    for r in data["routes"]:
        D(r["all_in_cost_pct"])  # parseable, may be negative when a route beats the stale daily reference
