"""Catalog record types: corridors, rails, venues, networks, provider capabilities and tariff versions."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

from app.money import ZERO

CapabilityStatus = Literal["documented", "assumed", "unsupported"]
TariffBasis = Literal["published_tariff", "user_assumption"]
TimingUnit = Literal["minutes", "business_days"]


@dataclass(frozen=True)
class Tariff:
    """A versioned fee formula: fixed + pct% of amount, clamped to [min_fee, max_fee], in `unit`."""

    unit: str
    fixed: Decimal = ZERO
    pct: Decimal = ZERO
    min_fee: Decimal | None = None
    max_fee: Decimal | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    basis: TariffBasis = "published_tariff"
    source_url: str | None = None
    effective_date: str | None = None
    reviewed_at: str | None = None  # None = seed value, not yet human-reviewed against the source
    note: str | None = None
    tariff_id: str = ""

    def fee(self, amount: Decimal) -> Decimal:
        f = self.fixed + amount * self.pct / Decimal(100)
        if self.min_fee is not None:
            f = max(f, self.min_fee)
        if self.max_fee is not None:
            f = min(f, self.max_fee)
        return f

    @property
    def reviewed(self) -> bool:
        return self.reviewed_at is not None and self.basis == "published_tariff"


@dataclass(frozen=True)
class Timing:
    """Duration estimate. `None` values mean unknown; unknown material legs make the route time unknown."""

    min: int | None
    typical: int | None
    max: int | None
    unit: TimingUnit = "minutes"
    calendar: str | None = None  # calendar id; None = 24x7
    note: str | None = None
    basis: TariffBasis = "user_assumption"

    @property
    def known(self) -> bool:
        return None not in (self.min, self.typical, self.max)


@dataclass(frozen=True)
class Calendar:
    id: str
    tz: str
    open_hour: int
    close_hour: int
    weekdays: tuple[int, ...] = (0, 1, 2, 3, 4)
    note: str = "Public holidays not modelled."


@dataclass(frozen=True)
class Rail:
    id: str
    name: str
    currency: str
    countries: tuple[str, ...]
    calendar: str | None  # None = 24x7
    description: str


@dataclass(frozen=True)
class Country:
    code: str
    name: str
    currency: str
    region: str
    rails: tuple[str, ...]


@dataclass(frozen=True)
class Currency:
    code: str
    name: str
    dp: int


@dataclass(frozen=True)
class Network:
    id: str
    name: str
    family: Literal["evm", "solana", "stellar", "algorand", "move", "cosmos", "other"]
    native_usdc: bool
    native_note: str
    usdc_contract: str | None
    gas_token: str
    gas_price_pair: str | None  # Kraken ticker pair for gas token in USD
    rpc_url: str | None
    rpc_env: str | None
    transfer_gas_units: int | None
    inclusion: Timing
    credit: Timing  # typical exchange deposit crediting after broadcast (confirmations)
    l2: bool = False
    docs_url: str | None = None


@dataclass(frozen=True)
class Availability:
    status: CapabilityStatus
    note: str = ""
    source_url: str | None = None


@dataclass(frozen=True)
class RailTerms:
    rail: str
    tariff: Tariff
    timing: Timing
    status: CapabilityStatus = "documented"
    crypto_withdrawal_hold: Timing | None = None  # hold before purchased crypto may be withdrawn
    note: str = ""


@dataclass(frozen=True)
class FiatSupport:
    currency: str
    market: Literal["book", "conversion"]
    conversion_tariff: Tariff | None = None  # for 1:1 conversions (e.g. Coinbase USD<->USDC)
    deposit: tuple[RailTerms, ...] = ()
    withdraw: tuple[RailTerms, ...] = ()


@dataclass(frozen=True)
class NetworkSupport:
    network: str
    withdraw_fee: Tariff  # in USDC; covers the on-chain send (do not add gas separately)
    withdraw_min: Decimal
    withdraw_timing: Timing  # exchange processing before broadcast
    deposit: bool = True
    withdraw: bool = True
    deposit_min: Decimal = ZERO
    credit_override: Timing | None = None
    status: CapabilityStatus = "documented"


@dataclass(frozen=True)
class Venue:
    id: str
    name: str
    url: str
    fee_schedule_url: str
    funding_url: str
    crypto_withdrawal_url: str
    taker_fee: Tariff  # pct, charged in quote currency, lowest-volume stablecoin tier
    countries: dict[str, Availability]
    fiat: dict[str, FiatSupport]
    networks: dict[str, NetworkSupport]
    participant_rules: tuple[str, ...]
    product_note: str = ""


@dataclass(frozen=True)
class WiseTerms:
    pay_in_rails: dict[str, tuple[str, ...]]
    source_fee: dict[str, Tariff]
    delivery: dict[str, Timing]
    availability: dict[str, Availability]
    corridors_unsupported: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class BankWireTerms:
    outgoing_fee: dict[str, Tariff]
    fx_margin_bps: Decimal
    intermediary_fee: dict[str, Tariff]
    receiving_fee: dict[str, Tariff]
    timing: Timing
    note: str


@dataclass
class Catalog:
    version: str
    currencies: dict[str, Currency]
    countries: dict[str, Country]
    rails: dict[str, Rail]
    calendars: dict[str, Calendar]
    networks: dict[str, Network]
    venues: dict[str, Venue]
    wise: WiseTerms
    bank_wire: BankWireTerms
    notes: list[str] = field(default_factory=list)
