"""Curated, versioned seed catalog.

IMPORTANT: Values here are compiled from provider documentation and secondary sources at implementation
time. A tariff with `reviewed_at=None` has NOT been reconfirmed against the provider page by a human and is
surfaced in the UI as "published tariff · unreviewed seed". Follow docs/tariff-review.md to review and bump
CATALOG_VERSION. Capability statuses ("documented" / "assumed" / "unsupported") follow the same rule.
"""

from __future__ import annotations

from decimal import Decimal as Dec

from app.catalog.models import (
    Availability,
    BankWireTerms,
    Calendar,
    Catalog,
    Country,
    Currency,
    FiatSupport,
    Network,
    NetworkSupport,
    Rail,
    RailTerms,
    Tariff,
    Timing,
    Venue,
    WiseTerms,
)

CATALOG_VERSION = "2026-11-10.seed-2"
SEED_DATE = "2026-09-27"

# ----------------------------------------------------------------------------------------- basics

CURRENCIES = {
    "CAD": Currency("CAD", "Canadian dollar", 2),
    "USD": Currency("USD", "US dollar", 2),
    "EUR": Currency("EUR", "Euro", 2),
    "GBP": Currency("GBP", "Pound sterling", 2),
    "JPY": Currency("JPY", "Japanese yen", 0),
}

CALENDARS = {
    "ca_bank": Calendar("ca_bank", "America/Toronto", 9, 17),
    "us_bank": Calendar("us_bank", "America/New_York", 9, 18),
    "eu_bank": Calendar("eu_bank", "Europe/Berlin", 8, 17),
    "uk_bank": Calendar("uk_bank", "Europe/London", 8, 17),
    "jp_bank": Calendar("jp_bank", "Asia/Tokyo", 9, 15),
}

EURO = ("DE", "FR", "NL", "ES")

RAILS = {
    "interac_etransfer": Rail("interac_etransfer", "Interac e-Transfer", "CAD", ("CA",), None,
                              "Canadian push payment, 24/7; per-transfer limits set by bank and provider."),
    "eft": Rail("eft", "EFT (direct deposit / PAD)", "CAD", ("CA",), "ca_bank", "Canadian batch EFT, business days."),
    "ca_wire": Rail("ca_wire", "Domestic wire (Lynx)", "CAD", ("CA",), "ca_bank", "High-value same-day wire."),
    "ach": Rail("ach", "ACH", "USD", ("US",), "us_bank", "US batch transfer, 1-3 business days."),
    "fedwire": Rail("fedwire", "Fedwire", "USD", ("US",), "us_bank", "US same-day wire."),
    "sepa": Rail("sepa", "SEPA Credit Transfer", "EUR", EURO, "eu_bank", "Euro area, typically next business day."),
    "sepa_instant": Rail("sepa_instant", "SEPA Instant", "EUR", EURO, None, "Euro area instant credit, 24/7."),
    "faster_payments": Rail("faster_payments", "Faster Payments", "GBP", ("GB",), None, "UK instant credit, 24/7."),
    "zengin": Rail("zengin", "Zengin (domestic transfer)", "JPY", ("JP",), "jp_bank", "Japan domestic transfer."),
}

COUNTRIES = {
    "CA": Country("CA", "Canada", "CAD", "North America", ("interac_etransfer", "eft", "ca_wire")),
    "US": Country("US", "United States", "USD", "North America", ("ach", "fedwire")),
    "DE": Country("DE", "Germany", "EUR", "Euro area", ("sepa", "sepa_instant")),
    "FR": Country("FR", "France", "EUR", "Euro area", ("sepa", "sepa_instant")),
    "NL": Country("NL", "Netherlands", "EUR", "Euro area", ("sepa", "sepa_instant")),
    "ES": Country("ES", "Spain", "EUR", "Euro area", ("sepa", "sepa_instant")),
    "GB": Country("GB", "United Kingdom", "GBP", "United Kingdom", ("faster_payments",)),
    "JP": Country("JP", "Japan", "JPY", "Japan", ("zengin",)),
}

# ----------------------------------------------------------------------------------------- networks

CIRCLE = "https://developers.circle.com/stablecoins/usdc-contract-addresses"


def _t(mn, typ, mx, note=None, unit="minutes", calendar=None, basis="user_assumption") -> Timing:
    return Timing(mn, typ, mx, unit=unit, calendar=calendar, note=note, basis=basis)


NETWORKS = {
    "ethereum": Network("ethereum", "Ethereum", "evm", True, "Native USDC issued by Circle.",
                        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "ETH", "XETHZUSD",
                        "https://ethereum-rpc.publicnode.com", "RPC_ETHEREUM", 65_000,
                        _t(1, 1, 5, "~12 s blocks; inclusion depends on priority fee"),
                        _t(3, 15, 30, "Exchanges typically wait 12-64 confirmations"), docs_url=CIRCLE),
    "base": Network("base", "Base", "evm", True, "Native USDC issued by Circle.",
                    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "ETH", "XETHZUSD",
                    "https://mainnet.base.org", "RPC_BASE", 65_000,
                    _t(1, 1, 2, "~2 s blocks"), _t(2, 10, 30, "Exchange-specific confirmation policy"),
                    l2=True, docs_url="https://docs.base.org/base-chain/api-reference/rpc-overview"),
    "arbitrum": Network("arbitrum", "Arbitrum One", "evm", True, "Native USDC (not bridged USDC.e).",
                        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "ETH", "XETHZUSD",
                        "https://arb1.arbitrum.io/rpc", "RPC_ARBITRUM", 65_000,
                        _t(1, 1, 2), _t(2, 10, 30), l2=True, docs_url=CIRCLE),
    "optimism": Network("optimism", "OP Mainnet", "evm", True, "Native USDC (not bridged USDC.e).",
                        "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "ETH", "XETHZUSD",
                        "https://mainnet.optimism.io", "RPC_OPTIMISM", 65_000,
                        _t(1, 1, 2), _t(2, 10, 30), l2=True, docs_url=CIRCLE),
    "polygon": Network("polygon", "Polygon PoS", "evm", True, "Native USDC (not bridged USDC.e).",
                       "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "POL", "POLUSD",
                       "https://polygon-bor-rpc.publicnode.com", "RPC_POLYGON", 65_000,
                       _t(1, 1, 3), _t(3, 10, 40, "Exchanges often wait ~128-256 blocks"), docs_url=CIRCLE),
    "avalanche": Network("avalanche", "Avalanche C-Chain", "evm", True, "Native USDC issued by Circle.",
                         "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", "AVAX", "AVAXUSD",
                         "https://api.avax.network/ext/bc/C/rpc", "RPC_AVALANCHE", 65_000,
                         _t(1, 1, 2, "Sub-second finality"), _t(1, 3, 15), docs_url=CIRCLE),
    "linea": Network("linea", "Linea", "evm", True, "Native USDC issued by Circle.",
                     "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", "ETH", "XETHZUSD",
                     "https://rpc.linea.build", "RPC_LINEA", 65_000,
                     _t(1, 1, 2), _t(5, 20, 60), l2=True, docs_url=CIRCLE),
    "solana": Network("solana", "Solana", "solana", True, "Native USDC SPL token issued by Circle.",
                      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "SOL", "SOLUSD",
                      "https://api.mainnet-beta.solana.com", "RPC_SOLANA", None,
                      _t(1, 1, 2, "~400 ms slots"), _t(1, 2, 10), docs_url=CIRCLE),
    "stellar": Network("stellar", "Stellar", "stellar", True, "Native USDC asset issued by Circle.",
                       "USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "XLM", "XXLMZUSD",
                       "https://horizon.stellar.org", "RPC_STELLAR", None,
                       _t(1, 1, 1, "~5 s ledgers"), _t(1, 2, 10), docs_url=CIRCLE),
    "algorand": Network("algorand", "Algorand", "algorand", True, "Native USDC ASA 31566704 issued by Circle.",
                        "31566704", "ALGO", "ALGOUSD", None, None, None,
                        _t(1, 1, 1, "~3 s finality"), _t(1, 2, 10), docs_url=CIRCLE),
    "sui": Network("sui", "Sui", "move", True, "Native USDC issued by Circle.",
                   "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", "SUI",
                   "SUIUSD", None, None, None, _t(1, 1, 1), _t(1, 3, 15), docs_url=CIRCLE),
    "aptos": Network("aptos", "Aptos", "move", True, "Native USDC issued by Circle.",
                     "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b", "APT", "APTUSD",
                     None, None, None, _t(1, 1, 1), _t(1, 3, 15), docs_url=CIRCLE),
    "noble": Network("noble", "Noble (Cosmos)", "cosmos", True, "Native USDC issued by Circle on Noble.",
                     "uusdc", "USDC", None, None, None, None, _t(1, 1, 1), _t(1, 3, 15), docs_url=CIRCLE),
    # Listed so the UI can explain why they never appear in routes.
    "tron": Network("tron", "TRON", "other", False,
                    "Circle discontinued native USDC on TRON (2024); only legacy balances remain.",
                    None, "TRX", None, None, None, None, _t(None, None, None), _t(None, None, None)),
    "bnb": Network("bnb", "BNB Smart Chain", "evm", False,
                   "USDC on BNB Smart Chain is a bridged (Binance-Peg) token, not native Circle USDC.",
                   None, "BNB", None, None, None, None, _t(None, None, None), _t(None, None, None)),
}

# ----------------------------------------------------------------------------------------- helpers


def fee(unit, fixed="0", pct="0", *, url=None, reviewed=None, min_fee=None, max_fee=None, min_amount=None,
        max_amount=None, basis="published_tariff", note=None, tid="") -> Tariff:
    return Tariff(unit=unit, fixed=Dec(fixed), pct=Dec(pct),
                  min_fee=None if min_fee is None else Dec(min_fee),
                  max_fee=None if max_fee is None else Dec(max_fee),
                  min_amount=None if min_amount is None else Dec(min_amount),
                  max_amount=None if max_amount is None else Dec(max_amount),
                  basis=basis, source_url=url, effective_date=SEED_DATE, reviewed_at=reviewed, note=note,
                  tariff_id=tid)


def bd(mn, typ, mx, cal, note=None) -> Timing:
    return Timing(mn, typ, mx, unit="business_days", calendar=cal, note=note)


def mins(mn, typ, mx, cal=None, note=None) -> Timing:
    return Timing(mn, typ, mx, unit="minutes", calendar=cal, note=note)


def usdc_net(network, fee_amt, url, *, minimum="5", proc=(1, 5, 60), reviewed=None, deposit=True,
             withdraw=True, status="documented", credit=None) -> NetworkSupport:
    return NetworkSupport(
        network=network,
        withdraw_fee=fee("USDC", fee_amt, url=url, reviewed=reviewed, tid=f"{network}-withdraw",
                         note="Customer-facing withdrawal fee; covers on-chain gas. Often dynamic."),
        withdraw_min=Dec(minimum),
        withdraw_timing=mins(*proc, note="Exchange withdrawal processing/queue before broadcast"),
        deposit=deposit, withdraw=withdraw, status=status, credit_override=credit,
    )


def rt(rail, tariff, timing, *, status="documented", hold=None, note="") -> RailTerms:
    return RailTerms(rail=rail, tariff=tariff, timing=timing, status=status, crypto_withdrawal_hold=hold, note=note)


def avail(status, note="", url=None) -> Availability:
    return Availability(status, note, url)


EU_OK = {c: avail("documented") for c in EURO}
SEPA_IN = lambda u, **kw: rt("sepa", fee("EUR", url=u, tid="sepa-in"), bd(0, 1, 2, "eu_bank"), **kw)  # noqa: E731
SEPA_INST_IN = lambda u, **kw: rt("sepa_instant", fee("EUR", url=u, tid="sepa-inst-in"),  # noqa: E731
                                  mins(1, 10, 60), **kw)

TWO_ACCOUNTS = (
    "Sender and recipient each need their own verified account at the venue they use.",
    "Fiat withdrawals go only to a bank account in the account holder's own name.",
)

# ----------------------------------------------------------------------------------------- venues

K_FUND = "https://support.kraken.com/articles/360000381846-cash-deposit-options-fees-minimums-and-processing-times-"
K_WD = "https://support.kraken.com/articles/360000423043-cash-withdrawal-options-fees-minimums-and-processing-times-"
K_CRYPTO = "https://support.kraken.com/articles/360000767986-cryptocurrency-withdrawal-fees-and-minimums"

KRAKEN = Venue(
    id="kraken", name="Kraken Pro", url="https://pro.kraken.com",
    fee_schedule_url="https://www.kraken.com/features/fee-schedule", funding_url=K_FUND,
    crypto_withdrawal_url=K_CRYPTO,
    taker_fee=fee("quote", pct="0.20", url="https://www.kraken.com/features/fee-schedule", reviewed=SEED_DATE,
                  note="Stablecoin & FX pairs, lowest volume tier (maker 0.20% / taker 0.20%).", tid="kraken-taker"),
    countries={
        "CA": avail("documented"), "US": avail("documented", "State restrictions apply; verify residence state."),
        **EU_OK, "GB": avail("documented"),
        "JP": avail("unsupported", "Kraken does not currently onboard Japan residents (verify)."),
    },
    fiat={
        "CAD": FiatSupport("CAD", "book",
                           deposit=(rt("interac_etransfer", fee("CAD", url=K_FUND, max_amount="10000", tid="k-interac-in"),
                                       mins(1, 30, 1440, note="Kraken: 0-1 business days or instant"), hold=None),
                                    rt("ca_wire", fee("CAD", url=K_FUND, min_amount="100", tid="k-cawire-in"),
                                       bd(0, 1, 2, "ca_bank"))),
                           withdraw=(rt("interac_etransfer", fee("CAD", "10", url=K_WD, max_amount="10000",
                                                                 tid="k-interac-out"), mins(10, 60, 1440)),
                                     rt("eft", fee("CAD", "1", url=K_WD, tid="k-eft-out"), bd(1, 2, 3, "ca_bank")))),
        "USD": FiatSupport("USD", "book",
                           deposit=(rt("ach", fee("USD", url=K_FUND, tid="k-ach-in"), bd(1, 1, 3, "us_bank"),
                                       hold=mins(4320, 10080, 10080, note="Kraken lists a 7-day withdrawal hold on Plaid ACH deposits (72 h general hold)")),
                                    rt("fedwire", fee("USD", url=K_FUND, tid="k-fedwire-in"), bd(0, 0, 1, "us_bank"))),
                           withdraw=(rt("ach", fee("USD", url=K_WD, tid="k-ach-out"), bd(1, 2, 3, "us_bank")),
                                     rt("fedwire", fee("USD", "4", url=K_WD, tid="k-fedwire-out"),
                                        bd(0, 0, 1, "us_bank")))),
        "EUR": FiatSupport("EUR", "book",
                           deposit=(rt("sepa", fee("EUR", url=K_FUND, tid="sepa-in"), bd(0, 1, 3, "eu_bank", "Kraken: up to 3 business days")),
                                    SEPA_INST_IN(K_FUND)),
                           withdraw=(rt("sepa", fee("EUR", "0.09", url=K_WD, tid="k-sepa-out"), bd(0, 1, 2, "eu_bank")),
                                     rt("sepa_instant", fee("EUR", "0.09", url=K_WD, tid="k-sepainst-out"),
                                        mins(1, 30, 240), status="assumed"))),
        "GBP": FiatSupport("GBP", "book",
                           deposit=(rt("faster_payments", fee("GBP", url=K_FUND, tid="k-fps-in"),
                                       mins(5, 30, 1440, note="Kraken: 0-1 business days; first deposit 1-3 business days")),),
                           withdraw=(rt("faster_payments", fee("GBP", url=K_WD, tid="k-fps-out"), mins(10, 60, 1440)),)),
    },
    networks={
        "ethereum": usdc_net("ethereum", "0.60", K_CRYPTO), "solana": usdc_net("solana", "0.90", K_CRYPTO),
        "polygon": usdc_net("polygon", "1", K_CRYPTO), "arbitrum": usdc_net("arbitrum", "2", K_CRYPTO),
        "optimism": usdc_net("optimism", "2", K_CRYPTO, status="assumed"), "base": usdc_net("base", "2", K_CRYPTO),
        "algorand": usdc_net("algorand", "0.50", K_CRYPTO, status="assumed"),
        "stellar": usdc_net("stellar", "0.50", K_CRYPTO, status="assumed"),
    },
    participant_rules=TWO_ACCOUNTS,
    product_note="Kraken Pro order book pricing (not Kraken instant-buy pricing).",
)

CB_FEES = "https://help.coinbase.com/en/exchange/trading-and-funding/exchange-fees"
CB_FUND = "https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees"
CB_SEND = "https://help.coinbase.com/en/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/network-fees"

COINBASE = Venue(
    id="coinbase", name="Coinbase Advanced", url="https://www.coinbase.com/advanced-trade",
    fee_schedule_url=CB_FEES, funding_url=CB_FUND, crypto_withdrawal_url=CB_SEND,
    taker_fee=fee("quote", pct="0.001", url=CB_FEES,
                  note="Stable-pair tier: 0.00% maker / 0.001% taker (confirmed for USDC/USD; verify for fiat books).",
                  tid="coinbase-taker"),
    countries={"CA": avail("documented"), "US": avail("documented"), **EU_OK, "GB": avail("documented"),
               "JP": avail("unsupported", "Coinbase suspended operations in Japan in 2023.")},
    fiat={
        "CAD": FiatSupport("CAD", "book",
                           deposit=(rt("interac_etransfer", fee("CAD", url=CB_FUND, max_amount="3000", tid="cb-interac-in"),
                                       mins(5, 30, 240), status="assumed"),),
                           withdraw=(rt("interac_etransfer", fee("CAD", url=CB_FUND, max_amount="3000",
                                                                 tid="cb-interac-out"), mins(10, 60, 1440),
                                        status="assumed"),)),
        "USD": FiatSupport("USD", "conversion",
                           conversion_tariff=fee("USD", url=CB_FEES, note="USD<->USDC converts 1:1 at no fee.",
                                                 tid="cb-usdc-conv"),
                           deposit=(rt("ach", fee("USD", url=CB_FUND, tid="cb-ach-in"), bd(0, 1, 3, "us_bank"),
                                       hold=mins(0, 7200, 14400, note="ACH-funded crypto may be send-locked for days")),
                                    rt("fedwire", fee("USD", "10", url=CB_FUND, tid="cb-wire-in"), bd(0, 0, 1, "us_bank"))),
                           withdraw=(rt("ach", fee("USD", url=CB_FUND, tid="cb-ach-out"), bd(1, 2, 3, "us_bank")),
                                     rt("fedwire", fee("USD", "25", url=CB_FUND, tid="cb-wire-out"),
                                        bd(0, 0, 1, "us_bank")))),
        "EUR": FiatSupport("EUR", "book",
                           deposit=(SEPA_IN(CB_FUND), SEPA_INST_IN(CB_FUND, status="assumed")),
                           withdraw=(rt("sepa", fee("EUR", "0.15", url=CB_FUND, tid="cb-sepa-out"),
                                        bd(0, 1, 2, "eu_bank")),)),
        "GBP": FiatSupport("GBP", "book",
                           deposit=(rt("faster_payments", fee("GBP", url=CB_FUND, tid="cb-fps-in"), mins(1, 15, 240)),),
                           withdraw=(rt("faster_payments", fee("GBP", url=CB_FUND, tid="cb-fps-out"),
                                        mins(5, 30, 1440)),)),
    },
    networks={
        "ethereum": usdc_net("ethereum", "1.50", CB_SEND), "base": usdc_net("base", "0", CB_SEND, minimum="1"),
        "solana": usdc_net("solana", "0", CB_SEND, minimum="1"), "polygon": usdc_net("polygon", "0.10", CB_SEND),
        "arbitrum": usdc_net("arbitrum", "0.10", CB_SEND), "optimism": usdc_net("optimism", "0.10", CB_SEND),
        "avalanche": usdc_net("avalanche", "0.10", CB_SEND), "noble": usdc_net("noble", "0", CB_SEND, status="assumed"),
        "sui": usdc_net("sui", "0.10", CB_SEND, status="assumed"),
        "aptos": usdc_net("aptos", "0.10", CB_SEND, status="assumed"),
        "stellar": usdc_net("stellar", "0.10", CB_SEND, status="assumed"),
    },
    participant_rules=TWO_ACCOUNTS,
    product_note="Coinbase Advanced / Exchange order book, not simple-buy spread pricing.",
)

BS_FEES = "https://www.bitstamp.net/fee-schedule/"
BS_BLOG = "https://blog.bitstamp.net/post/lower-trading-fees-for-maker-orders-and-stablecoins/"

BITSTAMP = Venue(
    id="bitstamp", name="Bitstamp", url="https://www.bitstamp.net", fee_schedule_url=BS_FEES, funding_url=BS_FEES,
    crypto_withdrawal_url=BS_FEES,
    taker_fee=fee("quote", pct="0.08", url=BS_BLOG,
                  note="0.40% base taker with stablecoin/fiat pairs weighted at 20% (≈0.08%).", tid="bitstamp-taker"),
    countries={"US": avail("documented"), **EU_OK, "GB": avail("documented", "No GBP/USDC book; GBP routes unavailable."),
               "CA": avail("unsupported", "No CAD support."), "JP": avail("unsupported")},
    fiat={
        "USD": FiatSupport("USD", "book",
                           deposit=(rt("ach", fee("USD", url=BS_FEES, tid="bs-ach-in"), bd(1, 2, 4, "us_bank"),
                                       status="assumed"),
                                    rt("fedwire", fee("USD", pct="0.05", min_fee="7.5", url=BS_FEES, tid="bs-wire-in"),
                                       bd(0, 1, 2, "us_bank"), status="assumed")),
                           withdraw=(rt("ach", fee("USD", url=BS_FEES, tid="bs-ach-out"), bd(1, 2, 4, "us_bank"),
                                        status="assumed"),)),
        "EUR": FiatSupport("EUR", "book", deposit=(SEPA_IN(BS_FEES),),
                           withdraw=(rt("sepa", fee("EUR", "3", url=BS_FEES, tid="bs-sepa-out"), bd(0, 1, 2, "eu_bank")),)),
    },
    networks={"ethereum": usdc_net("ethereum", "5", BS_FEES), "solana": usdc_net("solana", "1", BS_FEES, status="assumed")},
    participant_rules=TWO_ACCOUNTS,
)

BN_FEES = "https://www.binance.com/en/fee/schedule"
BN_WD = "https://www.binance.com/en/fee/cryptoFee"

BINANCE = Venue(
    id="binance", name="Binance", url="https://www.binance.com", fee_schedule_url=BN_FEES, funding_url=BN_FEES,
    crypto_withdrawal_url=BN_WD,
    taker_fee=fee("quote", pct="0.10", url=BN_FEES, note="Regular user spot taker; promotions may apply.",
                  tid="binance-taker"),
    countries={
        "FR": avail("documented", "Registered DASP (AMF)."), "ES": avail("documented"),
        "DE": avail("assumed", "Service availability for German residents should be verified."),
        "NL": avail("unsupported", "Binance exited the Netherlands in 2023."),
        "CA": avail("unsupported", "Binance exited Canada in 2023."),
        "US": avail("unsupported", "Binance.com does not serve US persons (Binance.US is separate)."),
        "GB": avail("unsupported", "New UK users restricted."), "JP": avail("unsupported", "Binance Japan is separate."),
    },
    fiat={"EUR": FiatSupport("EUR", "book", deposit=(SEPA_IN(BN_FEES, status="assumed"),),
                             withdraw=(rt("sepa", fee("EUR", "1", url=BN_FEES, tid="bn-sepa-out"),
                                          bd(0, 1, 2, "eu_bank"), status="assumed"),))},
    networks={
        "ethereum": usdc_net("ethereum", "1.50", BN_WD), "solana": usdc_net("solana", "0.80", BN_WD),
        "base": usdc_net("base", "0.20", BN_WD), "arbitrum": usdc_net("arbitrum", "0.20", BN_WD),
        "optimism": usdc_net("optimism", "0.20", BN_WD), "polygon": usdc_net("polygon", "0.10", BN_WD),
        "avalanche": usdc_net("avalanche", "0.30", BN_WD), "stellar": usdc_net("stellar", "0.20", BN_WD, status="assumed"),
        "sui": usdc_net("sui", "0.20", BN_WD, status="assumed"),
    },
    participant_rules=TWO_ACCOUNTS,
    product_note="EUR/USDC is quoted as EUR base / USDC quote (an inverse book for USDC buyers).",
)

OKX_FEES = "https://www.okx.com/fees"
OKX = Venue(
    id="okx", name="OKX", url="https://www.okx.com", fee_schedule_url=OKX_FEES, funding_url=OKX_FEES,
    crypto_withdrawal_url=OKX_FEES,
    taker_fee=fee("quote", pct="0.10", url=OKX_FEES, note="Regular user spot taker (verify stablecoin-fiat tier).",
                  tid="okx-taker"),
    countries={**{c: avail("documented", "OKX Europe (MiCA).") for c in EURO},
               "GB": avail("assumed", "No GBP/USDC book."), "US": avail("unsupported"),
               "CA": avail("unsupported", "Verify; not assumed available."), "JP": avail("unsupported")},
    fiat={"EUR": FiatSupport("EUR", "book", deposit=(SEPA_IN(OKX_FEES, status="assumed"),),
                             withdraw=(rt("sepa", fee("EUR", url=OKX_FEES, tid="okx-sepa-out"), bd(0, 1, 2, "eu_bank"),
                                          status="assumed"),))},
    networks={
        "ethereum": usdc_net("ethereum", "1.50", OKX_FEES), "solana": usdc_net("solana", "0.10", OKX_FEES),
        "base": usdc_net("base", "0.10", OKX_FEES), "arbitrum": usdc_net("arbitrum", "0.10", OKX_FEES),
        "optimism": usdc_net("optimism", "0.10", OKX_FEES), "polygon": usdc_net("polygon", "0.10", OKX_FEES),
        "avalanche": usdc_net("avalanche", "0.10", OKX_FEES), "linea": usdc_net("linea", "0.30", OKX_FEES, status="assumed"),
        "aptos": usdc_net("aptos", "0.10", OKX_FEES, status="assumed"),
    },
    participant_rules=TWO_ACCOUNTS,
)

BYBIT_FEES = "https://www.bybit.com/en/help-center/article/Trading-Fee-Structure"
BYBIT = Venue(
    id="bybit", name="Bybit EU", url="https://www.bybit.eu", fee_schedule_url=BYBIT_FEES, funding_url=BYBIT_FEES,
    crypto_withdrawal_url=BYBIT_FEES,
    taker_fee=fee("quote", pct="0.10", url=BYBIT_FEES, note="Regular user spot taker.", tid="bybit-taker"),
    countries={**{c: avail("documented", "Bybit EU (MiCA, Austria).") for c in EURO},
               "GB": avail("assumed", "No GBP/USDC book."), "US": avail("unsupported"),
               "CA": avail("unsupported", "Bybit exited Canada in 2023."), "JP": avail("unsupported")},
    fiat={"EUR": FiatSupport("EUR", "book", deposit=(SEPA_IN(BYBIT_FEES, status="assumed"),),
                             withdraw=(rt("sepa", fee("EUR", url=BYBIT_FEES, tid="bybit-sepa-out"),
                                          bd(0, 1, 2, "eu_bank"), status="assumed"),))},
    networks={
        "ethereum": usdc_net("ethereum", "2", BYBIT_FEES), "solana": usdc_net("solana", "0.50", BYBIT_FEES),
        "base": usdc_net("base", "0.30", BYBIT_FEES), "arbitrum": usdc_net("arbitrum", "0.30", BYBIT_FEES),
        "optimism": usdc_net("optimism", "0.30", BYBIT_FEES), "polygon": usdc_net("polygon", "0.30", BYBIT_FEES),
        "avalanche": usdc_net("avalanche", "0.30", BYBIT_FEES, status="assumed"),
    },
    participant_rules=TWO_ACCOUNTS,
)

VENUES = {v.id: v for v in (KRAKEN, COINBASE, BITSTAMP, BINANCE, OKX, BYBIT)}

# ----------------------------------------------------------------------------------------- conventional

WISE_PRICING = "https://wise.com/pricing/send-money"
WISE = WiseTerms(
    pay_in_rails={"CA": ("interac_etransfer", "eft", "ca_wire"), "US": ("ach", "fedwire"),
                  **{c: ("sepa", "sepa_instant") for c in EURO}, "GB": ("faster_payments",), "JP": ("zengin",)},
    source_fee={
        "CAD": fee("CAD", "2.00", "0.55", url=WISE_PRICING, basis="user_assumption", tid="wise-cad"),
        "USD": fee("USD", "1.00", "0.50", url=WISE_PRICING, basis="user_assumption", tid="wise-usd"),
        "EUR": fee("EUR", "0.60", "0.45", url=WISE_PRICING, basis="user_assumption", tid="wise-eur"),
        "GBP": fee("GBP", "0.50", "0.45", url=WISE_PRICING, basis="user_assumption", tid="wise-gbp"),
        "JPY": fee("JPY", "200", "0.65", url=WISE_PRICING, basis="user_assumption", tid="wise-jpy"),
    },
    delivery={
        "CAD": mins(5, 240, 2880), "USD": mins(5, 240, 2880), "EUR": mins(1, 60, 2880),
        "GBP": mins(1, 30, 1440), "JPY": mins(60, 1440, 4320),
    },
    availability={c: avail("documented") for c in COUNTRIES},
)

BANK_WIRE = BankWireTerms(
    outgoing_fee={
        "CAD": fee("CAD", "45", basis="user_assumption", tid="wire-out-cad"),
        "USD": fee("USD", "45", basis="user_assumption", tid="wire-out-usd"),
        "EUR": fee("EUR", "25", basis="user_assumption", tid="wire-out-eur"),
        "GBP": fee("GBP", "25", basis="user_assumption", tid="wire-out-gbp"),
        "JPY": fee("JPY", "4500", basis="user_assumption", tid="wire-out-jpy"),
    },
    fx_margin_bps=Dec("250"),
    intermediary_fee={
        "CAD": fee("CAD", "20", basis="user_assumption", tid="wire-mid-cad"),
        "USD": fee("USD", "15", basis="user_assumption", tid="wire-mid-usd"),
        "EUR": fee("EUR", "15", basis="user_assumption", tid="wire-mid-eur"),
        "GBP": fee("GBP", "12", basis="user_assumption", tid="wire-mid-gbp"),
        "JPY": fee("JPY", "2500", basis="user_assumption", tid="wire-mid-jpy"),
    },
    receiving_fee={
        "CAD": fee("CAD", "15", basis="user_assumption", tid="wire-rcv-cad"),
        "USD": fee("USD", "15", basis="user_assumption", tid="wire-rcv-usd"),
        "EUR": fee("EUR", "10", basis="user_assumption", tid="wire-rcv-eur"),
        "GBP": fee("GBP", "8", basis="user_assumption", tid="wire-rcv-gbp"),
        "JPY": fee("JPY", "2500", basis="user_assumption", tid="wire-rcv-jpy"),
    },
    timing=bd(1, 2, 5, None, "SWIFT with one correspondent hop; business days at sender's bank"),
    note="Retail bank SWIFT wire. All components are assumptions until a real bank customer quote is entered.",
)


def build_catalog() -> Catalog:
    return Catalog(
        version=CATALOG_VERSION, currencies=CURRENCIES, countries=COUNTRIES, rails=RAILS, calendars=CALENDARS,
        networks=NETWORKS, venues=VENUES, wise=WISE, bank_wire=BANK_WIRE,
        notes=[
            "No venue in the catalog lists a USDC/JPY order book; JPY stablecoin legs are unavailable.",
            "BNB Smart Chain and TRON are excluded: no native Circle USDC.",
            "Tariffs with reviewed_at=None are unreviewed seeds and keep routes at research grade.",
        ],
    )


CATALOG = build_catalog()
