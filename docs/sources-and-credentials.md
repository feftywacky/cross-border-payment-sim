# Sources & credential setup

All integrations are **read-only**. Secrets are backend-only environment variables. `/api/v1/sources/status` reports
only whether credentials are configured (a boolean), never their values.

| Source | Endpoint(s) | Auth | Notes |
|---|---|---|---|
| ECB reference FX | `data-api.ecb.europa.eu/service/data/EXR/D.CAD+GBP+JPY+USD.EUR.SP00.A` | none | Daily benchmark; crosses derived via EUR. Attribute the ECB. |
| Bank of Canada Valet | `bankofcanada.ca/valet/observations/FX…CAD/json` | none | CAD cross-check only. |
| Kraken | `/0/public/AssetPairs`, `/0/public/Depth`, `/0/public/Ticker` | none | Kraken Pro book pricing (not instant-buy). Ticker supplies gas-token USD prices. |
| Coinbase Exchange | `/products`, `/products/{id}/book?level=2` | none | USD↔USDC is a 1:1 conversion (no USD book). |
| Bitstamp | `/api/v2/trading-pairs-info/`, `/api/v2/order_book/{pair}/` | none | |
| Binance | `/api/v3/exchangeInfo`, `/api/v3/depth` | none | `EUR/USDC` is an inverse book. Not available to US/CA/UK/NL residents (catalog). |
| OKX | `/api/v5/public/instruments`, `/api/v5/market/books` | none | EEA via OKX Europe. |
| Bybit | `/v5/market/instruments-info`, `/v5/market/orderbook` | none | EEA via Bybit EU. |
| EVM chains | `eth_feeHistory` on public RPCs | optional keyed URL | Override with `RPC_ETHEREUM`, `RPC_BASE`, `RPC_ARBITRUM`, `RPC_OPTIMISM`, `RPC_POLYGON`, `RPC_AVALANCHE`, `RPC_LINEA`. |
| Solana | `getRecentPrioritizationFees` | optional | `RPC_SOLANA`. |
| Stellar | Horizon `/fee_stats` | none | |
| Wise | `POST /v3/quotes` | **`WISE_API_TOKEN`** (client-credentials bearer) | Partner access and usage terms required. Without it, Wise is an explicitly *assumed* tariff and never labelled live. |

Public endpoints have rate limits. Books are cached for 15 s and market lists for 1 h. Respect each provider's
terms of use before deploying publicly.

## Fixtures

`DATA_MODE=record python -m scripts.record_fixtures` (from `services/api`) captures every upstream payload into
`fixtures/http/` (large market lists are trimmed to USDC/fiat entries). `DATA_MODE=fixture` replays them offline.
Tests and the E2E suite use this mode, so they are deterministic and need no network.

## Adding a venue or network

1. Add an adapter class in `app/adapters/exchanges.py` with `markets()` (dynamic discovery) and `book()`.
2. Add a `Venue` in `app/catalog/seed.py`: country availability, fiat rails with tariffs/timings/holds, taker fee
   tier, and per-network USDC withdrawal fees. Mark anything not confirmed as `assumed`.
3. For a network, add a `Network` with its native USDC contract (Circle's list) and, if applicable, an RPC fee reader
   in `app/adapters/network.py`. Networks without native Circle USDC must use `native_usdc=False`.
4. Re-record fixtures, run the tests, and regenerate contracts (`npm run contracts`).
