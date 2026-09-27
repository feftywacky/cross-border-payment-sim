"""Reference FX benchmarks: ECB euro reference rates (primary) and Bank of Canada Valet (CAD cross-check).

These are daily analytical benchmarks, never executable customer rates."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.adapters.http import HTTP, SourceUnavailable
from app.config import settings
from app.money import D
from app.schemas import Observation

ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.CAD+GBP+JPY+USD.EUR.SP00.A"
ECB_DOC = "https://data.ecb.europa.eu/help/api/data-examples"
BOC_URL = "https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD,FXGBPCAD,FXJPYCAD/json"
BOC_DOC = "https://www.bankofcanada.ca/valet-api-how-to/"
METHOD = "fx-benchmark/1"


def _ts(epoch: float) -> datetime:
    return datetime.fromtimestamp(epoch, UTC)


async def fetch_ecb() -> list[Observation]:
    payload, fetched = await HTTP.request_json(
        "ecb", "GET", ECB_URL, params={"lastNObservations": "1", "format": "jsondata"}, ttl=settings.fx_ttl_s,
        record_name="ecb-exr",
    )
    try:
        structure = payload["structure"]
        currencies = [v["id"] for v in structure["dimensions"]["series"][1]["values"]]
        dates = [v["id"] for v in structure["dimensions"]["observation"][0]["values"]]
        out: list[Observation] = []
        for key, series in payload["dataSets"][0]["series"].items():
            idx = int(key.split(":")[1])
            obs_idx, values = max(series["observations"].items(), key=lambda kv: int(kv[0]))
            day = datetime.fromisoformat(dates[int(obs_idx)]).replace(hour=14, minute=15, tzinfo=UTC)
            out.append(Observation(
                source_id=f"ecb:EUR{currencies[idx]}", value=str(values[0]), unit=f"{currencies[idx]} per EUR",
                observed_at=day, fetched_at=_ts(fetched), expires_at=day + timedelta(days=4),
                status="live_api", provenance_url=ECB_DOC, scope="reference_fx_benchmark",
                methodology_version=METHOD,
                data={"base": "EUR", "quote": currencies[idx], "series": f"EXR.D.{currencies[idx]}.EUR.SP00.A"},
            ))
        return out
    except (KeyError, IndexError, ValueError) as exc:
        raise SourceUnavailable("ecb", f"unexpected payload: {type(exc).__name__}") from exc


async def fetch_boc() -> list[Observation]:
    payload, fetched = await HTTP.request_json("boc", "GET", BOC_URL, params={"recent": "1"}, ttl=settings.fx_ttl_s,
                                               record_name="boc-valet")
    try:
        row = payload["observations"][-1]
        day = datetime.fromisoformat(row["d"]).replace(hour=20, minute=30, tzinfo=UTC)
        out = []
        for series in ("FXUSDCAD", "FXEURCAD", "FXGBPCAD", "FXJPYCAD"):
            if series not in row:
                continue
            ccy = series[2:5]
            out.append(Observation(
                source_id=f"boc:{ccy}CAD", value=str(row[series]["v"]), unit=f"CAD per {ccy}", observed_at=day,
                fetched_at=_ts(fetched), expires_at=day + timedelta(days=4), status="live_api",
                provenance_url=BOC_DOC, scope="reference_fx_crosscheck", methodology_version=METHOD,
                data={"base": ccy, "quote": "CAD"},
            ))
        return out
    except (KeyError, IndexError, ValueError) as exc:
        raise SourceUnavailable("boc", f"unexpected payload: {type(exc).__name__}") from exc


def reference_rate(obs: dict[str, Observation], src: str, dst: str):
    """Target currency per 1 source currency, derived consistently through EUR. Returns (rate, ids, text)."""
    if src == dst:
        return D(1), [], "identity"

    def per_eur(ccy: str):
        if ccy == "EUR":
            return D(1), None
        o = obs.get(f"ecb:EUR{ccy}")
        if o is None or o.value is None:
            return None, None
        return D(o.value), o.source_id

    s_rate, s_id = per_eur(src)
    d_rate, d_id = per_eur(dst)
    if s_rate is None or d_rate is None:
        return None, [], "ECB reference unavailable"
    ids = [i for i in (s_id, d_id) if i]
    return d_rate / s_rate, ids, f"({dst} per EUR) / ({src} per EUR), ECB euro reference rates"


def boc_cross_check(obs: dict[str, Observation], src: str, dst: str):
    """Bank of Canada cross-rate for the same pair, when it can be derived via CAD."""

    def cad_per(ccy: str):
        if ccy == "CAD":
            return D(1)
        o = obs.get(f"boc:{ccy}CAD")
        return D(o.value) if o and o.value else None

    a, b = cad_per(src), cad_per(dst)
    if a is None or b is None or src == dst:
        return None
    return a / b
