from decimal import Decimal as D

import pytest

from app.pricing.orderbook import Book, ExecutionError, execute


def book(bids, asks, base="USDC", quote="EUR", **kw):
    return Book("v", "SYM", base, quote, [(D(p), D(q)) for p, q in bids], [(D(p), D(q)) for p, q in asks], **kw)


def test_buy_walks_asks_and_charges_fee_in_quote():
    b = book([("0.99", "100")], [("1.00", "50"), ("1.01", "100")])
    f = execute(b, "EUR", D("101.01"), D("1"))  # 1% fee -> notional 100.01
    assert f.side == "buy" and f.fee_unit == "EUR"
    assert f.fee == D("101.01") - D("101.01") / D("1.01")
    # 50 @1.00 = 50 EUR; remaining 50.0099.. EUR @1.01 = 49.51475..
    assert f.levels_used == 2
    assert f.amount_out == D("99.514753")  # floored at USDC 6dp
    assert f.worst_price == D("1.01")


def test_sell_walks_bids_fee_on_proceeds():
    b = book([("0.90", "10"), ("0.80", "100")], [("1.0", "1")])
    f = execute(b, "USDC", D("20"), D("0.5"), max_impact_bps=D("2000"))
    gross = D("10") * D("0.90") + D("10") * D("0.80")
    assert f.quote_notional == gross
    assert f.fee == gross * D("0.005")
    assert f.amount_out == D("16.91")  # floor 2dp of 16.915
    assert f.impact_bps == (D("0.10") / D("0.90") * 10000)


def test_inverse_book_buy_usdc_by_selling_fiat_base():
    # EUR/USDC book: price = USDC per EUR. Acquiring USDC with EUR = selling base EUR into bids.
    b = book([("1.14", "1000")], [("1.15", "1000")], base="EUR", quote="USDC")
    f = execute(b, "EUR", D("100"), D("0"))
    assert f.unit_out == "USDC" and f.amount_out == D("114")
    # And back: spend USDC to get EUR = buy base EUR from asks
    g = execute(b, "USDC", D("115"), D("0"))
    assert g.unit_out == "EUR" and g.amount_out == D("100")


def test_depth_exhaustion_rejected_not_top_of_book_filled():
    b = book([("0.99", "1")], [("1.00", "10")])
    with pytest.raises(ExecutionError) as e:
        execute(b, "EUR", D("1000"), D("0"))
    assert e.value.code == "INSUFFICIENT_DEPTH"


def test_price_impact_cap():
    b = book([("0.99", "1")], [("1.00", "10"), ("1.05", "1000")])
    with pytest.raises(ExecutionError) as e:
        execute(b, "EUR", D("100"), D("0"), max_impact_bps=D("100"))
    assert e.value.code == "PRICE_IMPACT_CAP"


def test_min_order_enforced():
    b = book([("0.99", "100")], [("1.00", "100")], min_quote=D("10"))
    with pytest.raises(ExecutionError) as e:
        execute(b, "EUR", D("5"), D("0"))
    assert e.value.code == "UNDER_MIN_ORDER"


def test_pair_mismatch():
    with pytest.raises(ExecutionError) as e:
        execute(book([("1", "1")], [("1", "1")]), "GBP", D("1"), D("0"))
    assert e.value.code == "PAIR_MISMATCH"


def test_stressed_book_depth_and_spread():
    b = book([("1.00", "100")], [("1.00", "100")]).stressed(D("0.5"), D("100"))
    assert b.asks[0] == (D("1.01"), D("50.0"))
    assert b.bids[0] == (D("0.99"), D("50.0"))
