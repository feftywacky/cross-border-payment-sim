"""Route graph enumeration and leg-by-leg pricing.

Every route starts from the same total sender debit `A` (source currency) and ends at the recipient's spendable
bank balance (target currency). Whitelisted path templates only:
  * conventional provider transfer (Wise)
  * bank SWIFT wire
  * fiat -> USDC @ venue V1 -> native USDC on network N -> venue V2 -> fiat
No loops, no bridges, no synthetic cross-asset conversions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from app.adapters.fx import reference_rate
from app.catalog.models import Calendar, Catalog, NetworkSupport, RailTerms, Tariff, Timing, Venue
from app.money import BPS, HUNDRED, ONE, ZERO, D, floor_unit, s
from app.pricing.orderbook import Book, ExecutionError, execute
from app.pricing.timing import TimedLeg, simulate
from app.provenance import Snapshot
from app.schemas import ComparisonRequest, Duration, FeeItem, LegResult, Overrides, RouteResult, TimingSplit

INSTANT = Timing(0, 1, 5, note="Taker order fills immediately")


class RouteExcluded(Exception):
    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


@dataclass
class Params:
    spread_bps: Decimal
    net_mult: Decimal
    depth_mult: Decimal
    prov_mult: Decimal
    payout_delay_h: Decimal
    funding_delay_h: Decimal
    bank_fx_bps: Decimal | None
    max_impact_bps: Decimal
    taker_override: Decimal | None

    @classmethod
    def from_overrides(cls, o: Overrides) -> Params:
        return cls(D(o.spread_bps), D(o.network_fee_multiplier), D(o.depth_multiplier), D(o.provider_fee_multiplier),
                   D(o.payout_delay_hours), D(o.funding_delay_hours),
                   D(o.bank_fx_spread_bps) if o.bank_fx_spread_bps else None, D(o.max_price_impact_bps),
                   D(o.trading_fee_override_pct) if o.trading_fee_override_pct else None)


@dataclass
class Ctx:
    req: ComparisonRequest
    snap: Snapshot
    cat: Catalog
    p: Params
    amount: Decimal
    check_freshness: bool
    now: datetime
    start: datetime
    R: Decimal | None = None
    R_ids: list[str] = field(default_factory=list)
    _books: dict = field(default_factory=dict)
    _fills: dict = field(default_factory=dict)

    @property
    def src(self) -> str:
        return self.req.source_currency

    @property
    def dst(self) -> str:
        return self.req.destination_currency

    def ref(self, amount: Decimal, unit: str, to: str) -> Decimal | None:
        """Convert at ECB reference rates (USDC valued at 1 USD for display). Used for reporting only."""
        unit = "USD" if unit == "USDC" else unit
        rate, _, _ = reference_rate(self.snap.observations, unit, to)
        return None if rate is None else amount * rate

    def calendar(self, cal_id: str | None) -> Calendar | None:
        return self.cat.calendars.get(cal_id) if cal_id else None

    def book(self, venue: str, fiat: str) -> tuple[Book, object]:
        key = (venue, fiat)
        if key not in self._books:
            obs = self.snap.book_obs(venue, fiat)
            if venue not in self.snap.markets:
                raise RouteExcluded("SOURCE_UNAVAILABLE", f"{venue} market data could not be fetched")
            if obs is None:
                if self.snap.market(venue, fiat) is None:
                    raise RouteExcluded("NO_MARKET", f"{venue} lists no USDC/{fiat} order book")
                raise RouteExcluded("SOURCE_UNAVAILABLE", f"{venue} USDC/{fiat} order book could not be fetched")
            if self.check_freshness and obs.expires_at and obs.expires_at < self.now:
                raise RouteExcluded("STALE_PRICE", f"{venue} USDC/{fiat} book observation expired")
            book = Book.from_data(obs.data).stressed(self.p.depth_mult, self.p.spread_bps)
            self._books[key] = (book, obs)
        return self._books[key]


class RouteBuilder:
    def __init__(self, ctx: Ctx, route_id: str, rtype: str, label: str, **meta):
        self.ctx = ctx
        self.id = route_id
        self.type = rtype
        self.label = label
        self.meta = meta
        self.amount = ctx.amount
        self.unit = ctx.src
        self.legs: list[LegResult] = []
        self.timed: list[TimedLeg] = []
        self.fees: list[FeeItem] = []
        self.statuses: set[str] = set()
        self.source_ids: list[str] = []
        self.unreviewed = False
        self.capability_assumed = False
        self.prerequisites: list[str] = []
        self.risks: list[str] = []
        self.provider_steps: list[str] = []
        self.gross_rate = ONE  # conversion rate excluding fees, target per source

    # -------------------------------------------------------------- helpers

    def tariff_status(self, t: Tariff) -> str:
        if t.basis == "user_assumption":
            return "user_assumption"
        if not t.reviewed:
            self.unreviewed = True
        return "published_tariff"

    def capability(self, status: str, what: str) -> None:
        if status == "unsupported":
            raise RouteExcluded("CAPABILITY_UNSUPPORTED", f"{what} is not supported")
        if status == "assumed":
            self.capability_assumed = True

    def fee(self, category, label, amount: Decimal, unit: str, status: str, source_id: str | None = None,
            assumption: bool = False) -> None:
        if amount == 0 and category not in ("trading",):
            return
        src_eq = self.ctx.ref(amount, unit, self.ctx.src)
        self.fees.append(FeeItem(category=category, label=label, amount=s(amount, _dp(unit)), unit=unit,
                                 amount_source=s(src_eq, 4) if src_eq is not None else None, source_status=status,
                                 source_id=source_id, assumption=assumption or status == "user_assumption"))

    def leg(self, kind: str, label: str, provider: str, out: Decimal, out_unit: str, fee: Decimal, fee_unit: str,
            timing: Timing, calendar: Calendar | None, status: str, source_ids=(), observed_at=None,
            assumptions=(), detail=None, extra_hours: Decimal = ZERO, schedule: str | None = None,
            pricing: bool = True) -> None:
        """Append a leg. `pricing=False` marks timing-only legs whose assumptions don't affect price quality."""
        if out <= 0:
            raise RouteExcluded("NON_POSITIVE_AMOUNT", f"Nothing left after {label.lower()}")
        if pricing:
            self.statuses.add(status)
        self.source_ids.extend(i for i in source_ids if i not in self.source_ids)
        dur = Duration(min=timing.min, typical=timing.typical, max=timing.max, known=timing.known,
                       note=_timing_note(timing, calendar, extra_hours))
        self.legs.append(LegResult(
            index=len(self.legs), kind=kind, label=label, provider=provider, amount_in=s(self.amount, _dp(self.unit)),
            unit_in=self.unit, amount_out=s(out, _dp(out_unit)), unit_out=out_unit, fee=s(fee, _dp(fee_unit)),
            fee_unit=fee_unit, duration=dur,
            schedule=schedule or (f"{timing.unit}; {calendar.id} ({calendar.tz} {calendar.open_hour}:00-"
                                  f"{calendar.close_hour}:00 Mon-Fri)" if calendar else f"{timing.unit}; 24/7"),
            source_ids=list(source_ids), source_status=status, observed_at=observed_at,
            assumptions=list(assumptions), detail=detail or {},
        ))
        self.timed.append(TimedLeg(timing, calendar, float(extra_hours), phase=_phase(kind)))
        self.amount, self.unit = out, out_unit

    def rail_leg(self, kind: str, provider: Venue, terms: RailTerms, direction: str, extra_hours: Decimal) -> None:
        rail = self.ctx.cat.rails[terms.rail]
        t = terms.tariff
        self.capability(terms.status, f"{provider.name} {rail.name} {direction}")
        if t.min_amount is not None and self.amount < t.min_amount:
            raise RouteExcluded("UNDER_MINIMUM", f"{provider.name} {rail.name} {direction} minimum is {t.min_amount} {t.unit}")
        if t.max_amount is not None and self.amount > t.max_amount:
            raise RouteExcluded("OVER_LIMIT", f"{provider.name} {rail.name} {direction} limit is {t.max_amount} {t.unit}")
        fee = t.fee(self.amount) * self.ctx.p.prov_mult
        status = self.tariff_status(t)
        cal = self.ctx.calendar(terms.timing.calendar or rail.calendar)
        assumptions = ["Sender's own bank fees for the outgoing transfer are not modelled."] if kind == "funding" else []
        if terms.status == "assumed":
            assumptions.append(f"{rail.name} {direction} support at {provider.name} is assumed, not documented.")
        if extra_hours:
            assumptions.append(f"Scenario adds {extra_hours} h delay.")
        if terms.timing.note:
            assumptions.append(terms.timing.note)
        self.fee("funding" if kind == "funding" else "payout", f"{provider.name} {rail.name} {direction} fee", fee,
                 self.unit, status, t.tariff_id)
        self.leg(kind, f"{rail.name} {direction} · {provider.name}", provider.name, self.amount - fee, self.unit, fee,
                 self.unit, terms.timing, cal, status, [f"tariff:{t.tariff_id}"], None, assumptions,
                 {"rail": rail.id, "tariff_url": t.source_url, "effective_date": t.effective_date,
                  "reviewed_at": t.reviewed_at, "limits": {"min": s(t.min_amount), "max": s(t.max_amount)}},
                 extra_hours)

    def trade(self, venue: Venue, give: str, get: str) -> None:
        ctx = self.ctx
        fiat = give if give != "USDC" else get
        support = venue.fiat[fiat]
        if support.market == "conversion":
            t = support.conversion_tariff
            fee = t.fee(self.amount)
            out = (self.amount - fee) * (ONE - ctx.p.spread_bps / BPS)
            status = self.tariff_status(t)
            self.fee("conversion", f"{venue.name} {give}->{get} conversion", fee, give, status, t.tariff_id)
            self.leg("conversion", f"Convert {give} → {get} 1:1 · {venue.name}", venue.name, floor_unit(out, get), get,
                     fee, give, INSTANT, None, status, [f"tariff:{t.tariff_id}"],
                     assumptions=[t.note or "1:1 conversion"], detail={"rate": "1", "tariff_url": t.source_url})
            self.gross_rate *= ONE - ctx.p.spread_bps / BPS
            return
        book, obs = ctx.book(venue.id, fiat)
        pct = ctx.p.taker_override if ctx.p.taker_override is not None else venue.taker_fee.pct
        key = (venue.id, fiat, give, self.amount, pct)
        fill = ctx._fills.get(key)
        if fill is None:
            try:
                fill = execute(book, give, self.amount, pct, max_impact_bps=ctx.p.max_impact_bps)
            except ExecutionError as exc:
                raise RouteExcluded(exc.code, f"{venue.name} {book.symbol}: {exc.message}") from exc
            ctx._fills[key] = fill
        fee_status = self.tariff_status(venue.taker_fee) if ctx.p.taker_override is None else "user_assumption"
        self.fee("trading", f"{venue.name} taker fee ({pct}%)", fill.fee, fill.fee_unit, fee_status,
                 venue.taker_fee.tariff_id)
        self.gross_rate *= fill.rate_out_per_in_gross()
        inverse = book.base != "USDC"
        assumptions = ["Public book is indicative and can move before an order is placed."]
        if not (ctx.p.depth_mult == ONE and ctx.p.spread_bps == ZERO):
            assumptions.append("Book stressed by scenario (depth/spread) — simulation.")
        self.leg("trade", f"{'Buy' if get == 'USDC' else 'Sell'} USDC for {fiat if get == 'USDC' else get} · "
                          f"{venue.name} {book.base}/{book.quote}", venue.name, fill.amount_out, fill.unit_out,
                 fill.fee, fill.fee_unit, INSTANT, None, "live_api" if obs.status == "live_api" else obs.status,
                 [obs.source_id, f"tariff:{venue.taker_fee.tariff_id}"], obs.observed_at, assumptions,
                 {"symbol": book.symbol, "book_orientation": "inverse (fiat base)" if inverse else "USDC base",
                  "side": f"{fill.side} {book.base} (walk {'asks' if fill.side == 'buy' else 'bids'})",
                  "best_price": s(fill.best_price), "vwap": s(fill.vwap, 8), "worst_price": s(fill.worst_price),
                  "impact_bps": s(fill.impact_bps, 2), "levels_used": fill.levels_used,
                  "mid": s(book.mid(), 8), "taker_fee_pct": s(pct), "levels": fill.depth_levels,
                  "fee_schedule_url": venue.fee_schedule_url, "observed_at": obs.observed_at.isoformat()
                  if obs.observed_at else None})

    # -------------------------------------------------------------- finish

    def result(self) -> RouteResult:
        ctx = self.ctx
        recipient = floor_unit(self.amount, ctx.dst)
        A, R = ctx.amount, ctx.R
        total_cost = pct = eff = spread = None
        if R is not None:
            total_cost = A - recipient / R
            pct = HUNDRED * (ONE - recipient / (A * R))
            spread = (ONE - self.gross_rate / R) * BPS
            explicit = sum((D(f.amount_source) for f in self.fees if f.amount_source is not None), ZERO)
            implied = total_cost - explicit
            if abs(implied) > D("0.00005"):
                self.fees.append(FeeItem(
                    category="implied_spread_impact", label="FX spread & price impact vs reference (implied)",
                    amount=s(implied, 4), unit=ctx.src, amount_source=s(implied, 4),
                    source_status="live_api" if self.type == "usdc" else "user_assumption",
                    assumption=self.type != "usdc"))
        eff = recipient / A
        sim = simulate(ctx.start, self.timed)
        statuses = self.statuses
        if "user_assumption" in statuses and not statuses & {"live_api", "provider_estimate"}:
            quality = "assumed"
        elif statuses <= {"live_api", "provider_estimate", "published_tariff"}:
            quality = "live"
        else:
            quality = "mixed"
        current = (quality == "live" and not self.unreviewed and not self.capability_assumed
                   and ctx.req.overrides.is_default() and ctx.snap.data_mode == "live")
        return RouteResult(
            id=self.id, type=self.type, label=self.label, provider_steps=self.provider_steps, eligible=True,
            recipient_amount=s(recipient, _dp(ctx.dst)), recipient_currency=ctx.dst,
            total_cost_source=s(total_cost, 4), all_in_cost_pct=s(pct, 4), effective_rate=s(eff, 8),
            spread_bps=s(spread, 2),
            duration=Duration(min=sim["min"], typical=sim["typical"], max=sim["max"], known=sim["known"],
                              note=None if sim["known"] else "At least one material leg has unknown duration"),
            timing_split=_split(sim), estimated_arrival=sim["arrival"], fee_breakdown=self.fees, legs=self.legs, input_quality=quality,
            recommendation_grade="current" if current else "research", source_ids=self.source_ids + ctx.R_ids,
            prerequisites=self.prerequisites, risks=self.risks, **self.meta,
        )


def _dp(unit: str) -> int:
    from app.money import dp

    return dp(unit)


_RAIL_KINDS = {"funding", "hold", "payout"}


def _phase(kind: str) -> str:
    return "rails" if kind in _RAIL_KINDS else "conversion"


def _split(sim: dict) -> TimingSplit | None:
    ph = sim.get("phases", {})

    def dur(name: str) -> Duration:
        d = ph.get(name) or {"min": 0, "typical": 0, "max": 0}
        known = sim["known"] and None not in (d.get("min"), d.get("typical"), d.get("max"))
        return Duration(min=d.get("min", 0) if known else None, typical=d.get("typical", 0) if known else None,
                        max=d.get("max", 0) if known else None, known=known)

    return TimingSplit(rails=dur("rails"), conversion=dur("conversion"))


def _timing_note(t: Timing, cal: Calendar | None, extra: Decimal) -> str | None:
    parts = [p for p in (t.note,) if p]
    if t.unit == "business_days":
        parts.append(f"{t.min}-{t.max} business days (typical {t.typical})")
    if cal:
        parts.append(f"{cal.id} hours apply; {cal.note}")
    if extra:
        parts.append(f"+{extra} h scenario delay")
    return "; ".join(parts) or None


def excluded(ctx: Ctx, route_id: str, rtype: str, label: str, code: str, reason: str, **meta) -> RouteResult:
    return RouteResult(id=route_id, type=rtype, label=label, provider_steps=[], eligible=False, exclusion_codes=[code],
                       exclusion_reasons=[reason], recipient_currency=ctx.dst, duration=Duration(known=False), **meta)


# ============================================================================== conventional routes


def wise_route(ctx: Ctx) -> RouteResult:
    cat, req, w = ctx.cat, ctx.req, ctx.cat.wise
    rid, label = "conv:wise", "Wise transfer (bank → bank)"
    meta = {"source_venue": "wise", "destination_venue": "wise"}
    try:
        for c in (req.source_country, req.destination_country):
            a = w.availability.get(c)
            if a is None or a.status == "unsupported":
                raise RouteExcluded("PROVIDER_UNAVAILABLE_IN_COUNTRY", f"Wise not available for {c}")
        pay_ins = w.pay_in_rails.get(req.source_country, ())
        if req.funding_method != "any_bank" and req.funding_method not in pay_ins:
            raise RouteExcluded("FUNDING_METHOD_UNSUPPORTED", f"Wise pay-in via {req.funding_method} not modelled")
        if ctx.R is None:
            raise RouteExcluded("REFERENCE_FX_UNAVAILABLE", "Wise estimate needs the reference mid-rate")
        rail = cat.rails[req.funding_method if req.funding_method != "any_bank" else pay_ins[0]]
        b = RouteBuilder(ctx, rid, "conventional_provider", label, funding_method=rail.id,
                         payout_method=req.payout_method, **meta)
        b.provider_steps = ["Sender bank", "Wise", "Recipient bank"]
        b.prerequisites = ["Sender has a Wise account; recipient bank details (no recipient Wise account needed)."]
        pay_in_timing = Timing(1, 10, 60) if rail.calendar is None else Timing(0, 0, 1, unit="business_days")
        b.leg("funding", f"Pay in by {rail.name}", "Wise", ctx.amount, ctx.src, ZERO, ctx.src, pay_in_timing,
              ctx.calendar(rail.calendar), "user_assumption", assumptions=["Pay-in timing assumed."],
              detail={"rail": rail.id}, pricing=False)
        live = ctx.snap.observations.get("wise:quote")
        if live is not None and req.overrides.is_default():
            fee_total = D(live.data["fee_total"])
            b.fee("provider", "Wise fee (quote)", fee_total, ctx.src, "provider_estimate", live.source_id)
            b.gross_rate = D(live.data["rate"])
            b.leg("conversion", "Wise conversion (display quote)", "Wise", D(live.value), ctx.dst, fee_total, ctx.src,
                  Timing(0, 0, 1), None, "provider_estimate", [live.source_id], live.observed_at,
                  ["Display quote; final pricing set at payment."], {"rate": live.data["rate"]})
        else:
            t = w.source_fee[ctx.src]
            fee = t.fee(ctx.amount) * ctx.p.prov_mult
            rate = ctx.R * (ONE - ctx.p.spread_bps / BPS)
            b.gross_rate = rate
            b.fee("provider", "Wise fee (fixed + variable, assumed)", fee, ctx.src, "user_assumption", t.tariff_id)
            b.leg("conversion", "Wise conversion at mid-market (ECB proxy)", "Wise",
                  floor_unit((ctx.amount - fee) * rate, ctx.dst), ctx.dst, fee, ctx.src, Timing(0, 0, 1), None,
                  "user_assumption", [f"tariff:{t.tariff_id}", *ctx.R_ids],
                  assumptions=["No Wise API credentials: fee formula assumed from published pricing page.",
                               "Wise converts at mid-market; ECB daily reference used as proxy."],
                  detail={"fee_fixed": s(t.fixed), "fee_pct": s(t.pct), "pricing_url": t.source_url})
        delivery = w.delivery[ctx.dst]
        b.leg("payout", "Delivery to recipient bank", "Wise", b.amount, ctx.dst, ZERO, ctx.dst, delivery, None,
              "user_assumption", assumptions=["Delivery-time range assumed from Wise's typical estimates."],
              extra_hours=ctx.p.payout_delay_h, pricing=False)
        b.risks = ["Quote/fee can change at checkout.", "First transfers may trigger verification holds."]
        return b.result()
    except RouteExcluded as exc:
        return excluded(ctx, rid, "conventional_provider", label, exc.code, exc.reason, **meta)


def bank_wire_route(ctx: Ctx) -> RouteResult:
    w = ctx.cat.bank_wire
    rid, label = "conv:bank_swift", "Retail bank SWIFT wire"
    try:
        if ctx.R is None:
            raise RouteExcluded("REFERENCE_FX_UNAVAILABLE", "Bank model needs the reference mid-rate")
        b = RouteBuilder(ctx, rid, "bank_wire", label, funding_method="bank_balance", payout_method="swift_credit")
        b.provider_steps = ["Sender bank", "Correspondent bank", "Recipient bank"]
        b.prerequisites = ["Sender's bank supports outgoing international wires from the chosen account tier."]
        out_fee = w.outgoing_fee[ctx.src].fee(ctx.amount) * ctx.p.prov_mult
        b.fee("provider", "Outgoing wire fee (assumed)", out_fee, ctx.src, "user_assumption")
        src_country_cal = _country_calendar(ctx, ctx.req.source_country)
        b.leg("funding", "Outgoing SWIFT wire fee", "Sender bank", ctx.amount - out_fee, ctx.src, out_fee, ctx.src,
              Timing(0, 0, 0, unit="business_days"), src_country_cal, "user_assumption",
              assumptions=["Fee billed separately is deducted from the fixed total debit."])
        margin = ctx.p.bank_fx_bps if ctx.p.bank_fx_bps is not None else w.fx_margin_bps
        rate = ctx.R * (ONE - (margin + ctx.p.spread_bps) / BPS)
        b.gross_rate = rate
        converted = floor_unit(b.amount * rate, ctx.dst)
        b.leg("conversion", f"Bank FX conversion (assumed {margin} bps margin)", "Sender bank", converted, ctx.dst,
              ZERO, ctx.dst, Timing(0, 0, 0), None, "user_assumption", ctx.R_ids,
              assumptions=["Bank FX margin is an explicit assumption; enter a real customer quote to replace it."],
              detail={"margin_bps": s(margin), "reference_rate": s(ctx.R, 8)})
        mid = w.intermediary_fee[ctx.dst].fee(b.amount)
        rcv = w.receiving_fee[ctx.dst].fee(b.amount)
        b.fee("intermediary", "Correspondent/intermediary deduction (assumed)", mid, ctx.dst, "user_assumption")
        b.leg("network", "Correspondent bank hop", "Correspondent", b.amount - mid, ctx.dst, mid, ctx.dst, w.timing,
              src_country_cal, "user_assumption", assumptions=[w.timing.note or ""])
        b.fee("receiving", "Recipient bank incoming wire fee (assumed)", rcv, ctx.dst, "user_assumption")
        b.leg("payout", "Recipient bank credit", "Recipient bank", b.amount - rcv, ctx.dst, rcv, ctx.dst,
              Timing(0, 0, 0), None, "user_assumption", extra_hours=ctx.p.payout_delay_h)
        b.risks = ["Intermediary deductions vary by correspondent chain.", "FX margin varies by bank and account tier."]
        return b.result()
    except RouteExcluded as exc:
        return excluded(ctx, rid, "bank_wire", label, exc.code, exc.reason)


def _country_calendar(ctx: Ctx, country: str) -> Calendar | None:
    for rail_id in ctx.cat.countries[country].rails:
        cal = ctx.cat.rails[rail_id].calendar
        if cal:
            return ctx.cat.calendars[cal]
    return None


# ============================================================================== USDC routes


def _rails(ctx: Ctx, venue: Venue, fiat: str, country: str, method: str, side: str) -> list[RailTerms]:
    support = venue.fiat.get(fiat)
    if support is None:
        return []
    terms = support.deposit if side == "deposit" else support.withdraw
    allowed = set(ctx.cat.countries[country].rails)
    return [t for t in terms if t.rail in allowed and (method == "any_bank" or t.rail == method)
            and t.status != "unsupported"]


def usdc_routes(ctx: Ctx) -> tuple[list[RouteResult], list[RouteResult]]:
    cat, req = ctx.cat, ctx.req
    eligible, out_excluded = [], []
    src_side, dst_side = [], []

    for venue in cat.venues.values():
        for side, country, fiat, method, bucket in (
            ("deposit", req.source_country, ctx.src, req.funding_method, src_side),
            ("withdraw", req.destination_country, ctx.dst, req.payout_method, dst_side),
        ):
            role = "sender" if side == "deposit" else "recipient"
            rid = f"usdc:{venue.id}:{role}"
            label = f"{venue.name} as {role} venue"
            avail = venue.countries.get(country)
            if avail is None or avail.status == "unsupported":
                note = f" {avail.note}" if avail and avail.note else ""
                out_excluded.append(excluded(ctx, rid, "usdc", label, "VENUE_UNAVAILABLE_IN_COUNTRY",
                                             f"{venue.name} does not serve {country}.{note}"))
                continue
            if fiat not in venue.fiat:
                out_excluded.append(excluded(ctx, rid, "usdc", label, "NO_FIAT_SUPPORT",
                                             f"{venue.name} has no {fiat} funding/cash-out and no USDC/{fiat} market"))
                continue
            rails = _rails(ctx, venue, fiat, country, method, side)
            if not rails:
                what = "funding" if side == "deposit" else "cash-out"
                out_excluded.append(excluded(ctx, rid, "usdc", label, "METHOD_UNSUPPORTED",
                                             f"{venue.name} {fiat} {what} via {method} not verified"))
                continue
            if venue.fiat[fiat].market == "book":
                try:
                    ctx.book(venue.id, fiat)
                except RouteExcluded as exc:
                    out_excluded.append(excluded(ctx, rid, "usdc", label, exc.code, exc.reason))
                    continue
            for r in rails:
                bucket.append((venue, r, avail.status))

    for n in cat.networks.values():
        if not n.native_usdc:
            out_excluded.append(excluded(ctx, f"usdc:*:{n.id}", "usdc", f"USDC on {n.name}", "NOT_NATIVE_USDC",
                                         n.native_note, network=n.id))

    for v1, fund, a1 in src_side:
        for v2, pay, a2 in dst_side:
            common = [nid for nid, ns in v1.networks.items()
                      if ns.withdraw and nid in v2.networks and v2.networks[nid].deposit and cat.networks[nid].native_usdc]
            for nid in common:
                r = _price_usdc(ctx, v1, fund, a1, nid, v2, pay, a2)
                (eligible if r.eligible else out_excluded).append(r)
    return eligible, out_excluded


def _price_usdc(ctx: Ctx, v1: Venue, fund: RailTerms, a1: str, nid: str, v2: Venue, pay: RailTerms, a2: str) -> RouteResult:
    cat = ctx.cat
    net = cat.networks[nid]
    rid = f"usdc:{v1.id}:{fund.rail}:{nid}:{v2.id}:{pay.rail}"
    label = f"{v1.name} ({cat.rails[fund.rail].name}) → USDC on {net.name} → {v2.name} ({cat.rails[pay.rail].name})"
    meta = dict(network=nid, source_venue=v1.id, destination_venue=v2.id, funding_method=fund.rail,
                payout_method=pay.rail)
    try:
        b = RouteBuilder(ctx, rid, "usdc", label, **meta)
        b.provider_steps = [v1.name, f"USDC · {net.name}", v2.name]
        b.capability(a1, f"{v1.name} in {ctx.req.source_country}")
        b.capability(a2, f"{v2.name} in {ctx.req.destination_country}")
        b.prerequisites = [
            f"Sender holds a verified {v1.name} account (resident of {ctx.req.source_country}).",
            f"Recipient holds a separate verified {v2.name} account (resident of {ctx.req.destination_country}).",
            f"Recipient shares a {net.name} USDC deposit address from {v2.name}; wrong network = loss of funds.",
            *v1.participant_rules[1:],
        ]
        b.risks = ["USDC may trade away from 1 USD; both books are priced at observation time.",
                   "Exchanges can pause network withdrawals/deposits without notice.",
                   "Public order books move; the fill is indicative, not executable."]

        b.rail_leg("funding", v1, fund, "deposit", ctx.p.funding_delay_h)
        b.trade(v1, ctx.src, "USDC")

        if fund.crypto_withdrawal_hold is not None:
            h = fund.crypto_withdrawal_hold
            b.leg("hold", f"Withdrawal hold after {cat.rails[fund.rail].name} funding · {v1.name}", v1.name, b.amount,
                  "USDC", ZERO, "USDC", h, None, "user_assumption",
                  assumptions=[h.note or "Hold on newly funded balances"], detail={"hold": True}, pricing=False)
            b.risks.append(f"{v1.name} may hold crypto withdrawals after {cat.rails[fund.rail].name} deposits.")

        ns1: NetworkSupport = v1.networks[nid]
        ns2: NetworkSupport = v2.networks[nid]
        b.capability(ns1.status, f"{v1.name} USDC withdrawal on {net.name}")
        b.capability(ns2.status, f"{v2.name} USDC deposit on {net.name}")
        if b.amount < ns1.withdraw_min:
            raise RouteExcluded("UNDER_MINIMUM", f"{v1.name} minimum USDC withdrawal on {net.name} is {ns1.withdraw_min}")
        wfee = ns1.withdraw_fee.fee(b.amount) * ctx.p.net_mult
        st = b.tariff_status(ns1.withdraw_fee)
        b.fee("withdrawal", f"{v1.name} USDC withdrawal fee ({net.name})", wfee, "USDC", st, ns1.withdraw_fee.tariff_id)
        wassume = ["Exchange withdrawal fee covers on-chain gas; gas is not added separately."]
        if ctx.p.net_mult != ONE:
            wassume.append(f"Network fee scaled ×{ctx.p.net_mult} (congestion scenario).")
        b.leg("withdrawal", f"Withdraw USDC on {net.name} · {v1.name}", v1.name, floor_unit(b.amount - wfee, "USDC"),
              "USDC", wfee, "USDC", ns1.withdraw_timing, None, st, [f"tariff:{ns1.withdraw_fee.tariff_id}"],
              assumptions=wassume + ([ns1.withdraw_timing.note] if ns1.withdraw_timing.note else []),
              detail={"tariff_url": ns1.withdraw_fee.source_url, "min_withdrawal": s(ns1.withdraw_min),
                      "effective_date": ns1.withdraw_fee.effective_date, "reviewed_at": ns1.withdraw_fee.reviewed_at})

        nobs = ctx.snap.observations.get(f"network:{nid}")
        gas_detail = {"usdc_contract": net.usdc_contract, "native_note": net.native_note}
        nstatus = "user_assumption"
        if nobs is not None and nobs.status != "unavailable":
            nstatus = nobs.status
            gas_detail.update({"self_custody_gas_usd": nobs.value, **(nobs.data or {})})
        elif nobs is not None:
            gas_detail["gas_estimate_error"] = nobs.error
        b.leg("network", f"On-chain transfer · {net.name}", net.name, b.amount, "USDC", ZERO, "USDC", net.inclusion,
              None, nstatus, [f"network:{nid}"] if nobs is not None else [], nobs.observed_at if nobs else None,
              ["Network inclusion time assumed from typical block times.",
               "Gas shown for reference only (paid by the exchange via its withdrawal fee)."], gas_detail, pricing=False)

        if b.amount < ns2.deposit_min:
            raise RouteExcluded("UNDER_MINIMUM", f"{v2.name} minimum USDC deposit is {ns2.deposit_min}")
        credit = ns2.credit_override or net.credit
        b.leg("deposit", f"Deposit confirmation · {v2.name}", v2.name, b.amount, "USDC", ZERO, "USDC", credit, None,
              "user_assumption", assumptions=["Confirmation count/crediting time assumed per network."], pricing=False)

        b.trade(v2, "USDC", ctx.dst)
        b.rail_leg("payout", v2, pay, "withdrawal", ctx.p.payout_delay_h)
        return b.result()
    except RouteExcluded as exc:
        return excluded(ctx, rid, "usdc", label, exc.code, exc.reason, **meta)


# ============================================================================== entry


def build_context(req: ComparisonRequest, snap: Snapshot, cat: Catalog, *, check_freshness: bool,
                  now: datetime | None = None) -> Ctx:
    now = now or datetime.now(UTC)
    ctx = Ctx(req=req, snap=snap, cat=cat, p=Params.from_overrides(req.overrides), amount=D(req.send_amount),
              check_freshness=check_freshness, now=now, start=(req.start_time or snap.created_at))
    if ctx.start.tzinfo is None:
        ctx.start = ctx.start.replace(tzinfo=UTC)
    rate, ids, _ = reference_rate(snap.observations, req.source_currency, req.destination_currency)
    ctx.R, ctx.R_ids = rate, ids
    return ctx


def price_all(ctx: Ctx) -> tuple[list[RouteResult], list[RouteResult]]:
    conv = [wise_route(ctx), bank_wire_route(ctx)]
    usdc_ok, usdc_bad = usdc_routes(ctx)
    ok = [r for r in conv if r.eligible] + usdc_ok
    bad = [r for r in conv if not r.eligible] + usdc_bad
    return ok, bad
