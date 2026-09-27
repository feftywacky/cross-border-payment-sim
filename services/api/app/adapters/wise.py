"""Optional Wise Platform display-quote adapter.

Gated on partner credentials (WISE_API_TOKEN, a client-credentials bearer token). Without it the engine uses
the clearly-labelled assumed tariff in the catalog and never marks Wise as live."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.adapters.http import HTTP, SourceUnavailable
from app.config import settings
from app.schemas import Observation

DOC = "https://docs.wise.com/guides/product/send-money/quotes/unauthenticated-quote"


def configured() -> bool:
    return bool(settings.wise_api_token)


async def quote(src: str, dst: str, amount: str) -> Observation:
    if not configured():
        raise SourceUnavailable("wise", "partner credentials not configured")
    payload, fetched = await HTTP.request_json(
        "wise", "POST", f"{settings.wise_api_base}/v3/quotes",
        json_body={"sourceCurrency": src, "targetCurrency": dst, "sourceAmount": amount},
        headers={"Authorization": f"Bearer {settings.wise_api_token}"}, ttl=30, record_name="wise-quote")
    try:
        option = next(o for o in payload["paymentOptions"] if o.get("payIn") == "BANK_TRANSFER" and not o.get("disabled"))
    except (KeyError, StopIteration) as exc:
        raise SourceUnavailable("wise", "no bank-transfer pay-in option in quote") from exc
    fetched_at = datetime.fromtimestamp(fetched, UTC)
    expires = payload.get("expirationTime")
    return Observation(
        source_id="wise:quote", value=str(option["targetAmount"]), unit=dst, observed_at=fetched_at,
        fetched_at=fetched_at,
        expires_at=datetime.fromisoformat(expires.replace("Z", "+00:00")) if expires else fetched_at + timedelta(minutes=5),
        status="provider_estimate", provenance_url=DOC, scope=f"Wise display quote {src}->{dst}",
        methodology_version="wise-quote/1",
        data={"rate": str(payload.get("rate")), "fee_total": str(option["fee"]["total"]),
              "source_amount": str(option["sourceAmount"]), "estimated_delivery": option.get("estimatedDelivery")},
    )
