"""Size-dependent taker execution against a fetched order book.

Buying base walks the asks; selling base walks the bids. Works for either book orientation: to acquire USDC
on a USDC/EUR book we buy base (asks); on an inverse EUR/USDC book we sell base EUR (bids). The taker fee is
charged in the quote currency. Slippage comes from the book only; no extra spread is added on top."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.money import BPS, HUNDRED, ONE, ZERO, D, floor_unit


class ExecutionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Book:
    venue: str
    symbol: str
    base: str
    quote: str
    bids: list[tuple[Decimal, Decimal]]  # price desc
    asks: list[tuple[Decimal, Decimal]]  # price asc
    min_base: Decimal | None = None
    min_quote: Decimal | None = None

    @classmethod
    def from_data(cls, data: dict) -> Book:
        def lv(rows):
            return [(D(p), D(q)) for p, q in rows if D(q) > 0]

        bids = sorted(lv(data["bids"]), key=lambda x: x[0], reverse=True)
        asks = sorted(lv(data["asks"]), key=lambda x: x[0])
        opt = lambda k: D(data[k]) if data.get(k) not in (None, "", "0") else None  # noqa: E731
        return cls(data["venue"], data["symbol"], data["base"], data["quote"], bids, asks, opt("min_base"),
                   opt("min_quote"))

    def mid(self) -> Decimal:
        return (self.bids[0][0] + self.asks[0][0]) / 2

    def stressed(self, depth_multiplier: Decimal = ONE, shift_bps: Decimal = ZERO) -> Book:
        """Counterfactual book: scale every level's size and widen prices away from the mid by shift_bps."""
        if depth_multiplier == ONE and shift_bps == ZERO:
            return self
        up, down = ONE + shift_bps / BPS, ONE - shift_bps / BPS
        return Book(self.venue, self.symbol, self.base, self.quote,
                    [(p * down, q * depth_multiplier) for p, q in self.bids],
                    [(p * up, q * depth_multiplier) for p, q in self.asks], self.min_base, self.min_quote)


@dataclass
class Fill:
    side: str  # "buy" (base) or "sell" (base)
    amount_in: Decimal
    unit_in: str
    amount_out: Decimal
    unit_out: str
    fee: Decimal
    fee_unit: str
    base_qty: Decimal
    quote_notional: Decimal
    vwap: Decimal  # quote per base
    best_price: Decimal
    worst_price: Decimal
    impact_bps: Decimal
    levels_used: int
    depth_levels: list[dict] = field(default_factory=list)

    def rate_out_per_in_gross(self) -> Decimal:
        """Conversion rate excluding the trading fee (unit_out per unit_in)."""
        return self.base_qty / self.quote_notional if self.side == "buy" else self.quote_notional / self.base_qty


def execute(book: Book, give_unit: str, amount: Decimal, taker_fee_pct: Decimal, *,
            max_impact_bps: Decimal = D(100)) -> Fill:
    """Spend `amount` of `give_unit` as a taker. Raises ExecutionError with a machine-readable code."""
    if amount <= 0:
        raise ExecutionError("NON_POSITIVE_AMOUNT", "Nothing left to trade after earlier fees")
    f = taker_fee_pct / HUNDRED
    if give_unit == book.quote:
        return _buy_base(book, amount, f, max_impact_bps)
    if give_unit == book.base:
        return _sell_base(book, amount, f, max_impact_bps)
    raise ExecutionError("PAIR_MISMATCH", f"{give_unit} is not in {book.base}/{book.quote}")


def _impact(best: Decimal, worst: Decimal) -> Decimal:
    return abs(worst - best) / best * BPS


def _check(book: Book, base_qty: Decimal, notional: Decimal) -> None:
    if book.min_base is not None and base_qty < book.min_base:
        raise ExecutionError("UNDER_MIN_ORDER", f"Order {base_qty} {book.base} is below the venue minimum "
                                                f"{book.min_base} {book.base}")
    if book.min_quote is not None and notional < book.min_quote:
        raise ExecutionError("UNDER_MIN_ORDER", f"Order {notional:.2f} {book.quote} is below the venue minimum "
                                                f"{book.min_quote} {book.quote}")


def _buy_base(book: Book, spend: Decimal, f: Decimal, cap: Decimal) -> Fill:
    if not book.asks:
        raise ExecutionError("EMPTY_BOOK", f"No asks on {book.venue} {book.symbol}")
    notional = spend / (ONE + f)
    fee = spend - notional
    remaining, got, used, levels = notional, ZERO, 0, []
    worst = book.asks[0][0]
    for price, qty in book.asks:
        if remaining <= 0:
            break
        cost = price * qty
        take = qty if cost <= remaining else remaining / price
        got += take
        remaining -= take * price
        worst = price
        used += 1
        levels.append({"price": str(price), "qty": str(take)})
    if remaining > D("1e-12"):
        raise ExecutionError("INSUFFICIENT_DEPTH", f"Fetched {book.venue} asks cannot fill {notional:.2f} {book.quote}")
    impact = _impact(book.asks[0][0], worst)
    if impact > cap:
        raise ExecutionError("PRICE_IMPACT_CAP", f"Fill would move price {impact:.1f} bps (> cap {cap} bps)")
    _check(book, got, notional)
    out = floor_unit(got, book.base)
    return Fill("buy", spend, book.quote, out, book.base, fee, book.quote, got, notional, notional / got,
                book.asks[0][0], worst, impact, used, levels[:25])


def _sell_base(book: Book, qty_in: Decimal, f: Decimal, cap: Decimal) -> Fill:
    if not book.bids:
        raise ExecutionError("EMPTY_BOOK", f"No bids on {book.venue} {book.symbol}")
    remaining, gross, used, levels = qty_in, ZERO, 0, []
    worst = book.bids[0][0]
    for price, qty in book.bids:
        if remaining <= 0:
            break
        take = min(qty, remaining)
        gross += take * price
        remaining -= take
        worst = price
        used += 1
        levels.append({"price": str(price), "qty": str(take)})
    if remaining > D("1e-12"):
        raise ExecutionError("INSUFFICIENT_DEPTH", f"Fetched {book.venue} bids cannot absorb {qty_in} {book.base}")
    impact = _impact(book.bids[0][0], worst)
    if impact > cap:
        raise ExecutionError("PRICE_IMPACT_CAP", f"Fill would move price {impact:.1f} bps (> cap {cap} bps)")
    _check(book, qty_in, gross)
    fee = gross * f
    out = floor_unit(gross - fee, book.quote)
    return Fill("sell", qty_in, book.base, out, book.quote, fee, book.quote, qty_in, gross, gross / qty_in,
                book.bids[0][0], worst, impact, used, levels[:25])
