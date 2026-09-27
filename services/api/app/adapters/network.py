"""On-chain network conditions: fee for one USDC transfer, quoted in USD via a timestamped gas-token price.

This applies to self-custody sends. A custodial exchange's withdrawal tariff is the customer-facing charge;
the route engine keeps the two separate and never adds this gas estimate on top of an exchange fee."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from statistics import median

from app.adapters.http import HTTP, SourceUnavailable
from app.catalog.models import Network
from app.catalog.seed import CATALOG
from app.config import settings
from app.money import D
from app.schemas import Observation

METHOD = "network-fee/1"
KRAKEN_TICKER = "https://api.kraken.com/0/public/Ticker"
WEI = Decimal(10) ** 18
SOL_TRANSFER_CU = 30_000  # typical compute units for an SPL token transfer (assumption)


def _ts(epoch: float) -> datetime:
    return datetime.fromtimestamp(epoch, UTC)


async def gas_token_prices() -> tuple[dict[str, Decimal], float]:
    pairs = sorted({n.gas_price_pair for n in CATALOG.networks.values() if n.gas_price_pair})
    payload, fetched = await HTTP.request_json("price:kraken", "GET", KRAKEN_TICKER, params={"pair": ",".join(pairs)},
                                               ttl=settings.network_ttl_s, record_name="kraken-ticker")
    if payload.get("error"):
        raise SourceUnavailable("price:kraken", ";".join(payload["error"]))
    return {k: D(v["c"][0]) for k, v in payload["result"].items()}, fetched


async def _rpc(n: Network, method: str, params: list) -> tuple[dict, float]:
    url = settings.rpc_url(n.rpc_env, n.rpc_url)
    if not url:
        raise SourceUnavailable(f"network:{n.id}", "no RPC configured")
    payload, fetched = await HTTP.request_json(
        f"network:{n.id}", "POST", url, json_body={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        ttl=settings.network_ttl_s, record_name=f"rpc-{n.id}")
    if "error" in payload:
        raise SourceUnavailable(f"network:{n.id}", str(payload["error"].get("message", "rpc error"))[:80])
    return payload["result"], fetched


def _obs(n: Network, fee_native: Decimal, price: Decimal | None, fetched: float, data: dict,
         status="live_api", url=None) -> Observation:
    usd = fee_native * price if price is not None else None
    return Observation(
        source_id=f"network:{n.id}", value=str(usd) if usd is not None else None, unit="USD per USDC transfer",
        observed_at=_ts(fetched), fetched_at=_ts(fetched), expires_at=_ts(fetched) + timedelta(seconds=60),
        status=status, provenance_url=url or n.docs_url, scope=f"{n.name} self-custody transfer estimate",
        methodology_version=METHOD,
        data={"network": n.id, "fee_native": str(fee_native), "gas_token": n.gas_token,
              "gas_token_usd": str(price) if price is not None else None, **data},
    )


async def _evm(n: Network, prices: dict) -> Observation:
    res, fetched = await _rpc(n, "eth_feeHistory", [5, "latest", [50]])
    base = int(res["baseFeePerGas"][-1], 16)
    tips = [int(r[0], 16) for r in res.get("reward") or [] if r]
    tip = int(median(tips)) if tips else 0
    gas_price = base + tip
    fee_native = D(gas_price) * n.transfer_gas_units / WEI
    data = {"base_fee_gwei": str(D(base) / D(10**9)), "priority_fee_gwei": str(D(tip) / D(10**9)),
            "gas_units": n.transfer_gas_units}
    if n.l2:
        data["note"] = "L2 execution gas only; L1 data-availability fee not included in this estimate."
    return _obs(n, fee_native, prices.get(n.gas_price_pair), fetched, data)


async def _solana(n: Network, prices: dict) -> Observation:
    res, fetched = await _rpc(n, "getRecentPrioritizationFees", [[n.usdc_contract]])
    fees = [r["prioritizationFee"] for r in res] or [0]
    micro = int(median(fees))
    lamports = 5000 + micro * SOL_TRANSFER_CU // 1_000_000
    fee_native = D(lamports) / D(10**9)
    return _obs(n, fee_native, prices.get(n.gas_price_pair), fetched,
                {"priority_micro_lamports_per_cu": micro, "compute_units": SOL_TRANSFER_CU,
                 "note": "Excludes ~0.002 SOL rent if the recipient has no USDC token account."})


async def _stellar(n: Network, prices: dict) -> Observation:
    url = settings.rpc_url(n.rpc_env, n.rpc_url)
    payload, fetched = await HTTP.request_json(f"network:{n.id}", "GET", f"{url}/fee_stats",
                                               ttl=settings.network_ttl_s, record_name="horizon-fee-stats")
    stroops = int(payload["fee_charged"]["p50"])
    return _obs(n, D(stroops) / D(10**7), prices.get(n.gas_price_pair), fetched,
                {"fee_p50_stroops": stroops, "ledger_capacity_usage": payload.get("ledger_capacity_usage")})


async def network_observations() -> tuple[list[Observation], list[tuple[str, str]]]:
    """Return observations and (source_id, error) pairs. Unavailable networks produce explicit observations."""
    errors: list[tuple[str, str]] = []
    try:
        prices, _ = await gas_token_prices()
    except SourceUnavailable as exc:
        prices = {}
        errors.append((exc.source_id, exc.message))

    now = datetime.now(UTC).timestamp()

    async def one(n: Network) -> Observation | None:
        try:
            if n.family == "evm" and n.rpc_url:
                return await _evm(n, prices)
            if n.family == "solana":
                return await _solana(n, prices)
            if n.family == "stellar":
                return await _stellar(n, prices)
            if n.family == "algorand":
                # Protocol minimum fee (0.001 ALGO) is fixed; no RPC needed.
                return _obs(n, D("0.001"), prices.get(n.gas_price_pair), now,
                            {"note": "Algorand protocol minimum fee"}, status="published_tariff")
            return Observation(source_id=f"network:{n.id}", fetched_at=_ts(now), status="unavailable",
                               scope=f"{n.name} self-custody transfer estimate", methodology_version=METHOD,
                               provenance_url=n.docs_url, error="No fee adapter configured for this network")
        except SourceUnavailable as exc:
            errors.append((exc.source_id, exc.message))
            return Observation(source_id=f"network:{n.id}", fetched_at=_ts(now), status="unavailable",
                               scope=f"{n.name} self-custody transfer estimate", methodology_version=METHOD,
                               provenance_url=n.docs_url, error=exc.message)
        except (KeyError, ValueError, TypeError, IndexError) as exc:
            errors.append((f"network:{n.id}", f"unexpected payload: {type(exc).__name__}"))
            return None

    results = await asyncio.gather(*(one(n) for n in CATALOG.networks.values() if n.native_usdc))
    return [r for r in results if r is not None], errors
