"""Decimal helpers. All financial arithmetic in the service goes through Decimal; never float."""

from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_EVEN, Decimal, getcontext

getcontext().prec = 34

ZERO = Decimal("0")
ONE = Decimal("1")
BPS = Decimal("10000")
HUNDRED = Decimal("100")

# Minor-unit precision used at documented currency/venue boundaries.
UNIT_DP: dict[str, int] = {
    "CAD": 2,
    "USD": 2,
    "EUR": 2,
    "GBP": 2,
    "JPY": 0,
    "USDC": 6,
}


def D(value: str | int | Decimal) -> Decimal:
    """Build a Decimal from a string/int. Floats are rejected to keep binary rounding out."""
    if isinstance(value, float):  # pragma: no cover - defensive
        raise TypeError("float passed to D(); use a string")
    return value if isinstance(value, Decimal) else Decimal(str(value))


def dp(unit: str) -> int:
    return UNIT_DP.get(unit, 8)


def floor_unit(amount: Decimal, unit: str) -> Decimal:
    """Round down to the unit's minor precision (conservative for the recipient)."""
    q = Decimal(1).scaleb(-dp(unit))
    return amount.quantize(q, rounding=ROUND_DOWN)


def round_unit(amount: Decimal, unit: str) -> Decimal:
    q = Decimal(1).scaleb(-dp(unit))
    return amount.quantize(q, rounding=ROUND_HALF_EVEN)


def s(amount: Decimal | None, places: int | None = None) -> str | None:
    """Serialize a Decimal as a plain (non-exponent) decimal string."""
    if amount is None:
        return None
    if places is not None:
        amount = amount.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)
    text = format(amount, "f")
    if "." in text and places is None:
        text = text.rstrip("0").rstrip(".") or "0"
    return text
