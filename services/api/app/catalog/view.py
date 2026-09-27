"""Public projection of the catalog for GET /catalog, including static corridor capability flags."""

from __future__ import annotations

from pydantic import BaseModel

from app.catalog.models import Catalog, Tariff
from app.money import s


class RailOut(BaseModel):
    id: str
    name: str
    currency: str
    schedule: str
    description: str


class CountryOut(BaseModel):
    code: str
    name: str
    currency: str
    region: str
    rails: list[RailOut]


class CurrencyOut(BaseModel):
    code: str
    name: str
    dp: int
    amount_min: str
    amount_max: str
    amount_default: str


class VenueCountryOut(BaseModel):
    country: str
    status: str
    note: str


class VenueNetworkOut(BaseModel):
    network: str
    withdraw_fee_usdc: str
    withdraw_min: str
    status: str
    deposit: bool
    withdraw: bool


class VenueOut(BaseModel):
    id: str
    name: str
    url: str
    fee_schedule_url: str
    taker_fee_pct: str
    taker_fee_reviewed: bool
    taker_fee_note: str | None
    fiat: list[str]
    fiat_market: dict[str, str]
    countries: list[VenueCountryOut]
    networks: list[VenueNetworkOut]
    participant_rules: list[str]
    product_note: str


class NetworkOut(BaseModel):
    id: str
    name: str
    family: str
    native_usdc: bool
    note: str
    usdc_contract: str | None
    gas_token: str
    l2: bool
    venues: list[str]
    docs_url: str | None


class CorridorOut(BaseModel):
    source_country: str
    destination_country: str
    conventional: bool
    usdc: bool
    usdc_venue_pairs: int
    explanation: str


class TariffOut(BaseModel):
    id: str
    provider: str
    description: str
    unit: str
    fixed: str
    pct: str
    basis: str
    source_url: str | None
    effective_date: str | None
    reviewed_at: str | None


class CatalogOut(BaseModel):
    version: str
    currencies: list[CurrencyOut]
    countries: list[CountryOut]
    venues: list[VenueOut]
    networks: list[NetworkOut]
    corridors: list[CorridorOut]
    tariffs: list[TariffOut]
    objectives: list[str]
    default_corridor: dict[str, str]
    notes: list[str]


def _tariff(tid: str, provider: str, desc: str, t: Tariff) -> TariffOut:
    return TariffOut(id=tid or f"{provider}-{desc}", provider=provider, description=desc, unit=t.unit, fixed=s(t.fixed),
                     pct=s(t.pct), basis=t.basis, source_url=t.source_url, effective_date=t.effective_date,
                     reviewed_at=t.reviewed_at)


def _side_ok(cat: Catalog, venue, country: str, side: str) -> bool:
    a = venue.countries.get(country)
    c = cat.countries[country]
    f = venue.fiat.get(c.currency)
    if a is None or a.status == "unsupported" or f is None:
        return False
    terms = f.deposit if side == "deposit" else f.withdraw
    return any(t.rail in c.rails and t.status != "unsupported" for t in terms)


def corridor(cat: Catalog, src: str, dst: str) -> CorridorOut:
    senders = [v for v in cat.venues.values() if _side_ok(cat, v, src, "deposit")]
    receivers = [v for v in cat.venues.values() if _side_ok(cat, v, dst, "withdraw")]
    pairs = 0
    for a in senders:
        for b in receivers:
            if any(n in b.networks and cat.networks[n].native_usdc for n in a.networks):
                pairs += 1
    if pairs:
        expl = f"{len(senders)} sender venue(s) × {len(receivers)} recipient venue(s) with a shared native USDC network."
    elif not senders:
        expl = f"No catalogued venue supports {cat.countries[src].currency} funding + USDC market in {src}."
    else:
        expl = f"No catalogued venue supports USDC → {cat.countries[dst].currency} cash-out in {dst}."
    return CorridorOut(source_country=src, destination_country=dst, conventional=True, usdc=pairs > 0,
                       usdc_venue_pairs=pairs, explanation=expl)


def catalog_out(cat: Catalog) -> CatalogOut:
    bands = {"JPY": ("1000", "150000000", "300000")}
    currencies = [CurrencyOut(code=c.code, name=c.name, dp=c.dp, amount_min=bands.get(c.code, ("10",))[0],
                              amount_max=bands.get(c.code, ("", "1000000"))[1],
                              amount_default=bands.get(c.code, ("", "", "2500"))[2])
                  for c in cat.currencies.values()]
    countries = [CountryOut(code=c.code, name=c.name, currency=c.currency, region=c.region,
                            rails=[RailOut(id=r, name=cat.rails[r].name, currency=cat.rails[r].currency,
                                           schedule="24/7" if cat.rails[r].calendar is None else
                                           f"business hours ({cat.rails[r].calendar})",
                                           description=cat.rails[r].description) for r in c.rails])
                 for c in cat.countries.values()]
    venues, tariffs = [], []
    for v in cat.venues.values():
        venues.append(VenueOut(
            id=v.id, name=v.name, url=v.url, fee_schedule_url=v.fee_schedule_url, taker_fee_pct=s(v.taker_fee.pct),
            taker_fee_reviewed=v.taker_fee.reviewed, taker_fee_note=v.taker_fee.note, fiat=list(v.fiat),
            fiat_market={k: f.market for k, f in v.fiat.items()},
            countries=[VenueCountryOut(country=k, status=a.status, note=a.note) for k, a in v.countries.items()],
            networks=[VenueNetworkOut(network=n.network, withdraw_fee_usdc=s(n.withdraw_fee.fixed),
                                      withdraw_min=s(n.withdraw_min), status=n.status, deposit=n.deposit,
                                      withdraw=n.withdraw) for n in v.networks.values()],
            participant_rules=list(v.participant_rules), product_note=v.product_note))
        tariffs.append(_tariff(v.taker_fee.tariff_id, v.name, "Taker fee (stablecoin tier)", v.taker_fee))
        for ccy, f in v.fiat.items():
            for side, terms in (("deposit", f.deposit), ("withdrawal", f.withdraw)):
                for t in terms:
                    tariffs.append(_tariff(t.tariff.tariff_id, v.name, f"{ccy} {cat.rails[t.rail].name} {side}", t.tariff))
            if f.conversion_tariff:
                tariffs.append(_tariff(f.conversion_tariff.tariff_id, v.name, f"{ccy}↔USDC conversion", f.conversion_tariff))
        for n in v.networks.values():
            tariffs.append(_tariff(f"{v.id}-{n.withdraw_fee.tariff_id}", v.name,
                                   f"USDC withdrawal on {cat.networks[n.network].name}", n.withdraw_fee))
    for ccy, t in cat.wise.source_fee.items():
        tariffs.append(_tariff(t.tariff_id, "Wise", f"Transfer fee from {ccy} (assumed)", t))
    for group, name in ((cat.bank_wire.outgoing_fee, "outgoing"), (cat.bank_wire.intermediary_fee, "intermediary"),
                        (cat.bank_wire.receiving_fee, "receiving")):
        for ccy, t in group.items():
            tariffs.append(_tariff(t.tariff_id, "Bank wire", f"{name} fee {ccy} (assumed)", t))
    networks = [NetworkOut(id=n.id, name=n.name, family=n.family, native_usdc=n.native_usdc, note=n.native_note,
                           usdc_contract=n.usdc_contract, gas_token=n.gas_token, l2=n.l2,
                           venues=[v.id for v in cat.venues.values() if n.id in v.networks], docs_url=n.docs_url)
                for n in cat.networks.values()]
    corridors = [corridor(cat, a, b) for a in cat.countries for b in cat.countries if a != b]
    default = {"source_country": "CA", "destination_country": "DE"}
    if not next((c for c in corridors if c.source_country == "CA" and c.destination_country == "DE" and c.usdc), None):
        first = next((c for c in corridors if c.usdc), corridors[0])
        default = {"source_country": first.source_country, "destination_country": first.destination_country}
    return CatalogOut(version=cat.version, currencies=currencies, countries=countries, venues=venues,
                      networks=networks, corridors=corridors, tariffs=tariffs,
                      objectives=["MOST_RECEIVED", "FASTEST", "WITHIN_DEADLINE"], default_corridor=default,
                      notes=cat.notes)
