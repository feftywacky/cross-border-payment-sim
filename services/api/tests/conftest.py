import os
import tempfile
from datetime import UTC, datetime, timedelta

os.environ["DATA_MODE"] = "fixture"
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"

import pytest  # noqa: E402

from app.provenance import Snapshot  # noqa: E402
from app.schemas import Observation  # noqa: E402

NOW = datetime(2026, 9, 29, 13, 0, tzinfo=UTC)  # a Tuesday, inside EU/CA business hours


def fx_obs(ccy: str, per_eur: str) -> Observation:
    return Observation(source_id=f"ecb:EUR{ccy}", value=per_eur, unit=f"{ccy} per EUR", observed_at=NOW,
                       fetched_at=NOW, expires_at=NOW + timedelta(days=4), status="live_api", scope="t",
                       methodology_version="t")


def book_obs(venue: str, symbol: str, base: str, quote: str, bids, asks, **kw) -> Observation:
    return Observation(source_id=f"book:{venue}:{symbol}", fetched_at=NOW, observed_at=NOW,
                       expires_at=NOW + timedelta(seconds=60), status="live_api", scope="t", methodology_version="t",
                       data={"venue": venue, "symbol": symbol, "base": base, "quote": quote, "bids": bids,
                             "asks": asks, **kw})


def deep(price: str, spread: str = "0.0005", size: str = "1000000", levels: int = 5):
    """Symmetric synthetic book around `price` (quote per base)."""
    from decimal import Decimal

    p, sp = Decimal(price), Decimal(spread)
    bids = [[str(p * (1 - sp * (i + 1))), size] for i in range(levels)]
    asks = [[str(p * (1 + sp * (i + 1))), size] for i in range(levels)]
    return bids, asks


@pytest.fixture
def synthetic_snapshot():
    """CAD->EUR world: USDC = 1.40 CAD = 0.875 EUR; ECB: 1.6 CAD/EUR, 1.143 USD/EUR."""

    def make(extra=None, markets=None, data_mode="live"):
        obs = {o.source_id: o for o in (fx_obs("CAD", "1.6"), fx_obs("USD", "1.143"), fx_obs("GBP", "0.86"),
                                         fx_obs("JPY", "179.7"))}
        cad_b, cad_a = deep("1.40")
        eur_b, eur_a = deep("0.875")
        books = [
            book_obs("kraken", "USDCCAD", "USDC", "CAD", cad_b, cad_a),
            book_obs("kraken", "USDCEUR", "USDC", "EUR", eur_b, eur_a),
            book_obs("coinbase", "USDC-CAD", "USDC", "CAD", cad_b, cad_a),
            book_obs("coinbase", "USDC-EUR", "USDC", "EUR", eur_b, eur_a),
            book_obs("bitstamp", "usdceur", "USDC", "EUR", eur_b, eur_a),
            book_obs("okx", "USDC-EUR", "USDC", "EUR", eur_b, eur_a),
            book_obs("bybit", "USDCEUR", "USDC", "EUR", eur_b, eur_a),
        ]
        # Binance quotes EUR/USDC (inverse): price = USDC per EUR
        inv_b, inv_a = deep(str(1 / __import__("decimal").Decimal("0.875")))
        books.append(book_obs("binance", "EURUSDC", "EUR", "USDC", inv_b, inv_a))
        for b in books:
            obs[b.source_id] = b
        mk = markets or {
            "kraken": [{"symbol": "USDCCAD", "base": "USDC", "quote": "CAD"},
                       {"symbol": "USDCEUR", "base": "USDC", "quote": "EUR"}],
            "coinbase": [{"symbol": "USDC-CAD", "base": "USDC", "quote": "CAD"},
                         {"symbol": "USDC-EUR", "base": "USDC", "quote": "EUR"}],
            "bitstamp": [{"symbol": "usdceur", "base": "USDC", "quote": "EUR"}],
            "binance": [{"symbol": "EURUSDC", "base": "EUR", "quote": "USDC"}],
            "okx": [{"symbol": "USDC-EUR", "base": "USDC", "quote": "EUR"}],
            "bybit": [{"symbol": "USDCEUR", "base": "USDC", "quote": "EUR"}],
        }
        for o in extra or []:
            obs[o.source_id] = o
        return Snapshot(id="snap_test", created_at=NOW, data_mode=data_mode, currencies=["CAD", "EUR"],
                        observations=obs, markets=mk, errors=[])

    return make
