"""Shared HTTP layer for read-only source adapters: timeouts, one retry, circuit breaker, TTL cache,
and a record/replay mode so tests and demos run against real recorded payloads."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from app.config import settings

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "http"


class SourceUnavailable(Exception):
    def __init__(self, source_id: str, message: str):
        super().__init__(f"{source_id}: {message}")
        self.source_id = source_id
        self.message = message


@dataclass
class _Breaker:
    failures: int = 0
    open_until: float = 0.0


def fixture_key(method: str, url: str, params: dict | None, body: Any | None) -> str:
    raw = json.dumps([method.upper(), url, sorted((params or {}).items()), body], sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


@dataclass
class HttpSource:
    """One client per process. `mode` is live | fixture | record."""

    mode: str = field(default_factory=lambda: settings.data_mode)
    timeout: float = field(default_factory=lambda: settings.http_timeout_s)
    _client: httpx.AsyncClient | None = None
    _breakers: dict[str, _Breaker] = field(default_factory=dict)
    _cache: dict[str, tuple[float, Any]] = field(default_factory=dict)
    _locks: dict[str, asyncio.Lock] = field(default_factory=dict)

    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={"User-Agent": "stablecoin-xborder-sim/0.1 (research; read-only)"},
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def clear_cache(self) -> None:
        self._cache.clear()

    async def request_json(
        self,
        source_id: str,
        method: str,
        url: str,
        *,
        params: dict | None = None,
        json_body: Any | None = None,
        headers: dict | None = None,
        ttl: float = 0,
        record_name: str | None = None,
        shrink: Any | None = None,
    ) -> tuple[Any, float]:
        """Return (payload, fetched_epoch). Raises SourceUnavailable; never returns substitute data."""
        key = fixture_key(method, url, params, json_body)
        if self.mode == "fixture":
            return self._replay(source_id, key, url)

        now = time.time()
        cached = self._cache.get(key)
        if ttl and cached and now - cached[0] < ttl:
            return cached[1], cached[0]

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cache.get(key)
            if ttl and cached and time.time() - cached[0] < ttl:
                return cached[1], cached[0]
            breaker = self._breakers.setdefault(source_id, _Breaker())
            if breaker.open_until > time.time():
                raise SourceUnavailable(source_id, "circuit open after repeated failures")
            last_exc: Exception | None = None
            for attempt in range(2):
                try:
                    resp = await self.client().request(method, url, params=params, json=json_body, headers=headers)
                    if resp.status_code == 429:
                        raise SourceUnavailable(source_id, "upstream rate limited (429)")
                    resp.raise_for_status()
                    payload = resp.json()
                    if shrink is not None:
                        payload = shrink(payload)
                    fetched = time.time()
                    breaker.failures = 0
                    if ttl:
                        self._cache[key] = (fetched, payload)
                    if self.mode == "record":
                        self._record(key, source_id, method, url, params, json_body, payload, record_name)
                    return payload, fetched
                except SourceUnavailable:
                    raise
                except (httpx.HTTPError, ValueError) as exc:
                    last_exc = exc
                    if attempt == 0:
                        await asyncio.sleep(0.25)
            breaker.failures += 1
            if breaker.failures >= 3:
                breaker.open_until = time.time() + 30
            raise SourceUnavailable(source_id, _safe_message(last_exc))

    # ------------------------------------------------------------------ fixtures

    def _record(self, key, source_id, method, url, params, body, payload, name) -> None:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
        entry = {"source_id": source_id, "method": method, "url": url, "params": params, "body": body,
                 "recorded_at": time.time(), "payload": payload}
        (FIXTURE_DIR / f"{key}.json").write_text(json.dumps(entry))
        index_path = FIXTURE_DIR / "_index.json"
        index = json.loads(index_path.read_text()) if index_path.exists() else {}
        index[key] = {"source_id": source_id, "url": url, "params": params, "name": name}
        index_path.write_text(json.dumps(index, indent=1, sort_keys=True))

    def _replay(self, source_id: str, key: str, url: str) -> tuple[Any, float]:
        path = FIXTURE_DIR / f"{key}.json"
        if not path.exists():
            raise SourceUnavailable(source_id, f"no recorded fixture for {url}")
        entry = json.loads(path.read_text())
        return entry["payload"], float(entry["recorded_at"])


def _safe_message(exc: Exception | None) -> str:
    if exc is None:
        return "unknown error"
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    if isinstance(exc, httpx.TimeoutException):
        return "timeout"
    # never echo URLs with credentials or headers
    return type(exc).__name__


HTTP = HttpSource()
