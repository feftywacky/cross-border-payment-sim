"""Builds immutable data snapshots from all read-only adapters in parallel.

Failed sources are recorded as errors; nothing is back-filled with benchmarks or older prices."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import UTC, datetime

from pydantic import BaseModel

from app.adapters import fx, network, wise
from app.adapters.exchanges import ADAPTERS, ExchangeAdapter
from app.adapters.http import SourceUnavailable
from app.catalog.seed import CATALOG
from app.config import settings
from app.schemas import Observation, SnapshotMeta, SourceError


class Snapshot(BaseModel):
    id: str
    created_at: datetime
    data_mode: str
    currencies: list[str]
    observations: dict[str, Observation]
    markets: dict[str, list[dict]]  # venue -> discovered USDC/fiat markets
    errors: list[SourceError]

    def meta(self) -> SnapshotMeta:
        return SnapshotMeta(id=self.id, created_at=self.created_at,
                            data_mode="fixture" if self.data_mode == "fixture" else "live",
                            observation_count=len(self.observations), errors=self.errors)

    def book_obs(self, venue: str, fiat: str) -> Observation | None:
        for m in self.markets.get(venue, []):
            if fiat in (m["base"], m["quote"]):
                return self.observations.get(f"book:{venue}:{m['symbol']}")
        return None

    def market(self, venue: str, fiat: str) -> dict | None:
        return next((m for m in self.markets.get(venue, []) if fiat in (m["base"], m["quote"])), None)


def _now() -> datetime:
    return datetime.now(UTC)


async def _venue(adapter: ExchangeAdapter, currencies: set[str], errors: list[SourceError]):
    try:
        markets = await adapter.markets()
    except SourceUnavailable as exc:
        errors.append(SourceError(source_id=exc.source_id, message=exc.message, at=_now()))
        return adapter.venue, None, []
    except (KeyError, TypeError, ValueError) as exc:
        errors.append(SourceError(source_id=f"book:{adapter.venue}", message=f"bad market list: {type(exc).__name__}",
                                  at=_now()))
        return adapter.venue, None, []
    wanted = [m for m in markets if m.fiat() in currencies]
    # Prefer one market per fiat (the first discovered) to keep route enumeration unambiguous.
    by_fiat: dict[str, object] = {}
    for m in wanted:
        by_fiat.setdefault(m.fiat(), m)
    obs = []

    async def one(m):
        try:
            return await adapter.book(m)
        except SourceUnavailable as exc:
            errors.append(SourceError(source_id=f"book:{adapter.venue}:{m.symbol}", message=exc.message, at=_now()))
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            errors.append(SourceError(source_id=f"book:{adapter.venue}:{m.symbol}",
                                      message=f"unexpected payload: {type(exc).__name__}", at=_now()))
        return None

    results = await asyncio.gather(*(one(m) for m in by_fiat.values()))
    obs = [r for r in results if r is not None]
    return adapter.venue, [m.__dict__ for m in by_fiat.values()], obs


async def build_snapshot(currencies: set[str], *, wise_quote: tuple[str, str, str] | None = None) -> Snapshot:
    errors: list[SourceError] = []
    observations: dict[str, Observation] = {}
    markets: dict[str, list[dict]] = {}

    async def guarded(name: str, coro):
        try:
            return await coro
        except SourceUnavailable as exc:
            errors.append(SourceError(source_id=exc.source_id, message=exc.message, at=_now()))
        except (KeyError, TypeError, ValueError) as exc:
            errors.append(SourceError(source_id=name, message=f"unexpected payload: {type(exc).__name__}", at=_now()))
        return None

    venue_tasks = [_venue(a, currencies, errors) for v, a in ADAPTERS.items() if v in CATALOG.venues]
    tasks = [guarded("ecb", fx.fetch_ecb()), guarded("boc", fx.fetch_boc()), network.network_observations(),
             *venue_tasks]
    if wise_quote and wise.configured():
        tasks.append(guarded("wise", wise.quote(*wise_quote)))
    results = await asyncio.gather(*tasks)

    ecb, boc, (net_obs, net_errors), *rest = results
    for group in (ecb, boc, net_obs):
        for o in group or []:
            observations[o.source_id] = o
    for sid, msg in net_errors:
        errors.append(SourceError(source_id=sid, message=msg, at=_now()))
    for item in rest:
        if isinstance(item, Observation):  # wise quote
            observations[item.source_id] = item
        elif isinstance(item, tuple):
            venue, mk, obs = item
            if mk is not None:
                markets[venue] = mk
            for o in obs:
                observations[o.source_id] = o

    # Content-addressed id: requests served from the same cached observations share one stored snapshot.
    basis = sorted((o.source_id, o.fetched_at.isoformat(), o.value or "") for o in observations.values())
    digest = hashlib.sha256(json.dumps([basis, sorted(currencies), settings.data_mode]).encode()).hexdigest()[:20]
    return Snapshot(id=f"snap_{digest}", created_at=_now(), data_mode=settings.data_mode,
                    currencies=sorted(currencies), observations=observations, markets=markets, errors=errors)
