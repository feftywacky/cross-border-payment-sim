"""Public, read-only order-book adapters for major exchanges.

Each adapter discovers USDC/fiat markets dynamically (symbol mapping is never hard-coded, so inverse books
such as Binance EUR/USDC are handled) and returns normalized order-book observations. No auth, no orders."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.adapters.http import HTTP, SourceUnavailable
from app.config import settings
from app.schemas import Observation

FIATS = {"CAD", "USD", "EUR", "GBP", "JPY"}
STABLE = "USDC"
METHOD = "orderbook/1"
MARKETS_TTL = 3600.0


@dataclass(frozen=True)
class Market:
    venue: str
    symbol: str
    base: str
    quote: str
    min_base: str | None = None
    min_quote: str | None = None

    def fiat(self) -> str:
        return self.quote if self.base == STABLE else self.base


def _relevant(base: str, quote: str) -> bool:
    return (base == STABLE and quote in FIATS) or (quote == STABLE and base in FIATS)


# Upstream market lists are large; keep only USDC/fiat entries (applied before caching and fixture recording).
def _kraken_shrink(p):
    res = {k: v for k, v in (p.get("result") or {}).items()
           if "/" in v.get("wsname", "") and _relevant(*v["wsname"].split("/"))}
    return {"error": p.get("error", []), "result": res}


def _coinbase_shrink(p):
    return [x for x in p if _relevant(x.get("base_currency"), x.get("quote_currency"))]


def _binance_shrink(p):
    return {"symbols": [s for s in p.get("symbols", []) if _relevant(s.get("baseAsset"), s.get("quoteAsset"))]}


def _okx_shrink(p):
    return {**p, "data": [i for i in p.get("data", []) if _relevant(i.get("baseCcy"), i.get("quoteCcy"))]}


def _bybit_shrink(p):
    if p.get("retCode") != 0:
        return p
    lst = [s for s in p["result"]["list"] if _relevant(s.get("baseCoin"), s.get("quoteCoin"))]
    return {**p, "result": {**p["result"], "list": lst}}


def _ts(epoch: float) -> datetime:
    return datetime.fromtimestamp(epoch, UTC)


def _book_obs(m: Market, bids: list, asks: list, fetched: float, doc: str, observed: float | None = None) -> Observation:
    bids_n = [[str(p), str(q)] for p, q, *_ in bids]
    asks_n = [[str(p), str(q)] for p, q, *_ in asks]
    if not bids_n or not asks_n:
        raise SourceUnavailable(f"book:{m.venue}", f"empty book for {m.symbol}")
    obs_at = _ts(observed or fetched)
    return Observation(
        source_id=f"book:{m.venue}:{m.symbol}", value=None, unit=f"{m.quote} per {m.base}",
        observed_at=obs_at, fetched_at=_ts(fetched),
        expires_at=_ts(fetched) + timedelta(seconds=settings.book_expiry_s), status="live_api",
        provenance_url=doc, scope=f"{m.venue} spot order book", methodology_version=METHOD,
        data={"venue": m.venue, "symbol": m.symbol, "base": m.base, "quote": m.quote, "bids": bids_n,
              "asks": asks_n, "min_base": m.min_base, "min_quote": m.min_quote},
    )


class ExchangeAdapter:
    venue: str
    doc: str

    async def markets(self) -> list[Market]:  # pragma: no cover - interface
        raise NotImplementedError

    async def book(self, m: Market) -> Observation:  # pragma: no cover - interface
        raise NotImplementedError

    async def _get(self, url: str, params: dict | None = None, ttl: float = 0, name: str | None = None,
                   shrink=None) -> tuple[Any, float]:
        return await HTTP.request_json(f"book:{self.venue}", "GET", url, params=params, ttl=ttl, record_name=name,
                                       shrink=shrink)


class Kraken(ExchangeAdapter):
    venue = "kraken"
    doc = "https://docs.kraken.com/api-reference/market-data/get-order-book"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://api.kraken.com/0/public/AssetPairs", ttl=MARKETS_TTL, name="kraken-pairs",
                                     shrink=_kraken_shrink)
        if payload.get("error"):
            raise SourceUnavailable("book:kraken", ";".join(payload["error"]))
        out = []
        for key, p in payload["result"].items():
            ws = p.get("wsname", "")
            if "/" not in ws:
                continue
            base, quote = ws.split("/")
            base = "USDC" if base == "USDC" else base.replace("XBT", "BTC")
            if _relevant(base, quote) and p.get("status", "online") == "online":
                out.append(Market(self.venue, key, base, quote, p.get("ordermin"), p.get("costmin")))
        return out

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get("https://api.kraken.com/0/public/Depth",
                                           {"pair": m.symbol, "count": "500"}, ttl=settings.book_ttl_s)
        if payload.get("error"):
            raise SourceUnavailable("book:kraken", ";".join(payload["error"]))
        book = next(iter(payload["result"].values()))
        return _book_obs(m, book["bids"], book["asks"], fetched, self.doc)


class Coinbase(ExchangeAdapter):
    venue = "coinbase"
    doc = "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductbook"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://api.exchange.coinbase.com/products", ttl=MARKETS_TTL,
                                     name="coinbase-products", shrink=_coinbase_shrink)
        return [Market(self.venue, p["id"], p["base_currency"], p["quote_currency"], p.get("base_min_size"),
                       p.get("min_market_funds"))
                for p in payload
                if _relevant(p.get("base_currency"), p.get("quote_currency"))
                and p.get("status") == "online" and not p.get("trading_disabled")]

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get(f"https://api.exchange.coinbase.com/products/{m.symbol}/book",
                                           {"level": "2"}, ttl=settings.book_ttl_s)
        return _book_obs(m, payload["bids"][:500], payload["asks"][:500], fetched, self.doc)


class Bitstamp(ExchangeAdapter):
    venue = "bitstamp"
    doc = "https://www.bitstamp.net/api/#tag/Order-book"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://www.bitstamp.net/api/v2/trading-pairs-info/", ttl=MARKETS_TTL,
                                     name="bitstamp-pairs")
        out = []
        for p in payload:
            base, _, quote = p.get("name", "").partition("/")
            if _relevant(base, quote) and p.get("trading") == "Enabled":
                min_quote = (p.get("minimum_order") or "").split(" ")[0] or None
                out.append(Market(self.venue, p["url_symbol"], base, quote, None, min_quote))
        return out

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get(f"https://www.bitstamp.net/api/v2/order_book/{m.symbol}/",
                                           ttl=settings.book_ttl_s)
        return _book_obs(m, payload["bids"][:500], payload["asks"][:500], fetched, self.doc,
                         observed=float(payload.get("timestamp", fetched)))


class Binance(ExchangeAdapter):
    venue = "binance"
    doc = "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://api.binance.com/api/v3/exchangeInfo", {"permissions": "SPOT"},
                                     ttl=MARKETS_TTL, name="binance-exchangeinfo", shrink=_binance_shrink)
        out = []
        for s in payload.get("symbols", []):
            if not _relevant(s["baseAsset"], s["quoteAsset"]) or s.get("status") != "TRADING":
                continue
            f = {x["filterType"]: x for x in s.get("filters", [])}
            out.append(Market(self.venue, s["symbol"], s["baseAsset"], s["quoteAsset"],
                              f.get("LOT_SIZE", {}).get("minQty"), f.get("NOTIONAL", {}).get("minNotional")))
        return out

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get("https://api.binance.com/api/v3/depth",
                                           {"symbol": m.symbol, "limit": "500"}, ttl=settings.book_ttl_s)
        return _book_obs(m, payload["bids"], payload["asks"], fetched, self.doc)


class Okx(ExchangeAdapter):
    venue = "okx"
    doc = "https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-order-book"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://www.okx.com/api/v5/public/instruments", {"instType": "SPOT"},
                                     ttl=MARKETS_TTL, name="okx-instruments", shrink=_okx_shrink)
        return [Market(self.venue, i["instId"], i["baseCcy"], i["quoteCcy"], i.get("minSz"), None)
                for i in payload.get("data", [])
                if _relevant(i.get("baseCcy"), i.get("quoteCcy")) and i.get("state") == "live"]

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get("https://www.okx.com/api/v5/market/books",
                                           {"instId": m.symbol, "sz": "400"}, ttl=settings.book_ttl_s)
        if payload.get("code") != "0" or not payload.get("data"):
            raise SourceUnavailable("book:okx", payload.get("msg") or "empty response")
        d = payload["data"][0]
        return _book_obs(m, d["bids"], d["asks"], fetched, self.doc, observed=int(d["ts"]) / 1000)


class Bybit(ExchangeAdapter):
    venue = "bybit"
    doc = "https://bybit-exchange.github.io/docs/v5/market/orderbook"

    async def markets(self) -> list[Market]:
        payload, _ = await self._get("https://api.bybit.com/v5/market/instruments-info",
                                     {"category": "spot", "limit": "1000"}, ttl=MARKETS_TTL, name="bybit-instruments", shrink=_bybit_shrink)
        if payload.get("retCode") != 0:
            raise SourceUnavailable("book:bybit", payload.get("retMsg", "error"))
        return [Market(self.venue, s["symbol"], s["baseCoin"], s["quoteCoin"],
                       s.get("lotSizeFilter", {}).get("minOrderQty"), s.get("lotSizeFilter", {}).get("minOrderAmt"))
                for s in payload["result"]["list"]
                if _relevant(s.get("baseCoin"), s.get("quoteCoin")) and s.get("status") == "Trading"]

    async def book(self, m: Market) -> Observation:
        payload, fetched = await self._get("https://api.bybit.com/v5/market/orderbook",
                                           {"category": "spot", "symbol": m.symbol, "limit": "200"},
                                           ttl=settings.book_ttl_s)
        if payload.get("retCode") != 0:
            raise SourceUnavailable("book:bybit", payload.get("retMsg", "error"))
        r = payload["result"]
        return _book_obs(m, r["b"], r["a"], fetched, self.doc, observed=int(r["ts"]) / 1000)


ADAPTERS: dict[str, ExchangeAdapter] = {a.venue: a for a in (Kraken(), Coinbase(), Bitstamp(), Binance(), Okx(), Bybit())}
