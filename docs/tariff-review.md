# Seed tariff review procedure

Tariffs and capabilities in `services/api/app/catalog/seed.py` are **versioned seed data**. A tariff with
`reviewed_at=None` is shown as "published fee · seed, not yet reviewed". Any route that depends on one stays
`research` grade.

**Cadence:** at least monthly, and whenever a provider announces a pricing or network change.

## Steps

1. Open `/methodology` → *Tariff versions*. Each row links to its source page.
2. For each row, confirm on the provider page for the relevant country and account type:
   - fixed fee, percentage, min/max fee, per-transaction limits;
   - for fiat rails: processing time and any holds on withdrawing crypto bought with those funds;
   - for USDC withdrawals: the network is supported for **native** USDC (not bridged), the current fee and the minimum;
   - for taker fees: the lowest-volume tier for **stablecoin/FX pairs** on the order-book product.
3. Update the value in `seed.py` and pass `reviewed="YYYY-MM-DD"` to that `fee(...)` call.
   Change a capability `status` to `documented` only if the provider documentation states it.
4. Bump `CATALOG_VERSION` (e.g. `2026-10-15.r1`). Old quote runs keep their original catalog version for replay.
5. Run `pytest`, then `npm run contracts` if any schema changed. Commit with the list of reviewed sources.

## Currently reviewed

| Tariff | Reviewed | Source |
|---|---|---|
| Kraken Pro stablecoin & FX pairs taker 0.20% | 2026-09-27 | kraken.com/features/fee-schedule |

Everything else is an unreviewed seed. Values sourced from secondary material during implementation:

- Kraken: Interac e-Transfer deposit free / CAD 10 withdrawal, 10,000 CAD per-transaction limit. USDC withdrawal
  fees Solana 0.9, Polygon 1, Arbitrum 2, Base 2, Ethereum 0.6 (Kraken fees are dynamic).
- Coinbase: stable-pair taker 0.001% (confirmed for USDC/USD; verify for USDC/EUR, GBP and CAD).
- Bitstamp: 0.40% base taker with fiat/stablecoin volume weighted at 20% (about 0.08%).
- Wise: fixed + variable fee by source currency (assumption; replace with the API when credentials exist).
