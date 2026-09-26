# Stablecoin Cross-Border Payment Simulator — Engineering Specification

**Version:** 1.0 · **Date:** 2026-09-26 · **Status:** Implementation brief

## 1. Purpose and scope

Answer: **Under what transaction sizes and market conditions can a stablecoin route deliver more recipient money and/or faster usable settlement than a traditional cross-border payment route?** The product is a research and comparison web app. It displays estimates and recommends feasible simulated routes; it does not move money, place orders, create wallets, or give a guaranteed executable quote.

**Core user journey:** Choose the source country/currency, destination country/currency, amount, funding and payout methods. See current exchange prices and applicable trading fees, an all-in cost comparison, estimated recipient amount, and the fastest/cheapest feasible route. Change the amount or market assumptions to see when the preferred route changes. Open a route to inspect every step, source, and fee.

**MVP choices:**

- Fiat currencies: **CAD, USD, EUR, GBP, JPY**. Countries are separate from currencies; seed CA, US, selected euro-area country or countries, GB, and JP. Only show a corridor as supported after provider availability is checked. JPY remains selectable even if only a conventional or assumed route is available; explain missing stablecoin legs.
- Stablecoin: native **USDC**. Initial candidate networks: **Base and Ethereum**. A network appears as a feasible route only if the sending and receiving services support the same native asset and network. Additional assets/networks are adapters, not synthetic conversions.
- Default comparison: sender bank balance to **recipient bank balance**, with a fixed **total sender debit**. A recipient-wallet endpoint or pre-funded sender balance is a separate comparison mode and must never be mixed into a bank-to-bank ranking without disclosure.
- Time to recipient bank availability is part of the core result because the research question includes settlement speed. If no defensible estimate exists, display **Unknown** and make no faster-route claim.
- “Smart order routing” means computing and ranking candidate **simulated payment paths**, including the appropriate market order-book side and network. It does not execute, split, or custody orders.

## 2. Functional requirements

| ID | Requirement | User-visible result |
| --- | --- | --- |
| F1 | Validate country, currency, amount, funding method, recipient method, and selected time. Default to a source-currency send amount; positive amount within configured route limits. | Clear form validation and only supported choices. |
| F2 | Fetch fresh tradable market order books and provider quotes when access exists; combine them with versioned published trading, funding, withdrawal, and bank/remittance tariffs. | “Live order book,” “Provider estimate,” “Published fee,” or “Assumption” beside each component, with last-updated time. |
| F3 | Model conventional routes and end-to-end USDC routes, including funding, buy, withdrawal or wallet send, chain inclusion, recipient deposit/confirmation, sale, and local payout. | Comparable recipient-bank outcomes and expandable leg-by-leg breakdown. |
| F4 | Calculate recipient amount, sender-currency equivalent cost, effective FX rate, spread versus a reference mid-rate, fee categories, liquidity impact, and estimated completion time. | Side-by-side cards/table, with a common sender debit and recipient endpoint. |
| F5 | Reject unsupported, unavailable, insufficient-liquidity, under-minimum, over-limit, or stale routes. Preserve their rejection reasons. | “Unavailable: EUR cash-out method not verified” instead of an invented quote. |
| F6 | Rank routes by **most received**, **fastest**, or **most received within a user time limit**. Recompute on every parameter change. | Recommended route, alternatives, reason for selection, and cost/time trade-off. |
| F7 | Sweep transaction amount and change FX spread, trading liquidity, on-chain fees, provider fees, and payout/funding delay; recompute all route legs. | Break-even amount(s), sensitivity chart, and “cheaper/faster/both/neither” map. |
| F8 | Save or share a reproducible scenario with its snapshot IDs, inputs, route/model versions, tariff effective dates, and assumptions; export CSV/JSON of comparison and sweep results. | Shareable read-only link and downloadable research data. |
| F9 | Indicate data coverage and expiry; do not silently replace failed feeds with a benchmark or yesterday’s price. | Explicit stale/estimated/error states and a refresh action. |

**No sign-up for MVP.** Saved scenarios use opaque, unguessable IDs and no personal financial account information. No actual account credentials, recipient details, or payment instructions are collected.

## 3. Data sources and availability contract

Implement each source as a server-side adapter returning a normalized observation: `{source_id, value, unit, observed_at, fetched_at, expires_at, status, provenance_url, scope, methodology_version}`. Store rates as directed pairs, e.g. EUR per USD. Historical observations are immutable. Source status is `live_api | provider_estimate | published_tariff | historical | user_assumption | unavailable`.

| Component | Proposed source / integration | Use and limitations |
| --- | --- | --- |
| Reference FX mid-rate | [ECB EXR API](https://data.ecb.europa.eu/help/api/data-examples) for the five fiat currencies; [Bank of Canada Valet](https://www.bankofcanada.ca/valet-api-how-to/) as a Canadian cross-check. | Daily analytical benchmark, not an executable customer exchange rate. Match publication dates; derive crosses consistently through EUR when needed. Never label “live FX quote.” |
| Exchange execution price and depth | [Kraken public AssetPairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs), [Depth](https://docs.kraken.com/api-reference/market-data/get-order-book) (`GET /0/public/Depth?pair=...`) and ticker as needed. | Use actual supported pairs, bid/ask and cumulative depth to estimate size-dependent taker execution. Symbol mapping is dynamic; do not assume USDC/JPY or regional availability. Public data is indicative and can move before an order. |
| Trading fee | [Kraken spot fee schedule](https://www.kraken.com/features/fee-schedule), tracked with effective date and region/tier. | Default to the published lowest-volume **stablecoin/FX** tier for supported pairs; expose an editable fee tier/assumption. A published schedule is not a live personalized fee. Avoid confusing Kraken instant-buy pricing with Kraken Pro order-book pricing. |
| Funding, crypto withdrawal, cash-out | [Kraken cash deposit methods](https://support.kraken.com/articles/360000381846-cash-deposit-options-fees-minimums-and-processing-times-), [cash withdrawals](https://support.kraken.com/articles/360000423043-cash-withdrawal-options-fees-minimums-and-processing-times-), [crypto withdrawal fees](https://support.kraken.com/articles/360000767986-cryptocurrency-withdrawal-fees-and-minimums). Curate/version relevant rows, including limits, holds, country, account and method rules. | Published fees may change at checkout. Model the exchange's withdrawal fee **instead of** separately adding RPC gas when it already covers the on-chain send. Confirm both participants can use their own accounts; [Kraken requires cash withdrawal to a matching-name bank account](https://support.kraken.com/articles/360048656092-how-to-withdraw-funds-from-your-kraken-account). |
| Conventional transfer quote | Optional [Wise Platform display quote](https://docs.wise.com/guides/product/send-money/quotes/unauthenticated-quote), preserving pay-in option, rate, fee, recipient amount, and delivery estimate. | **Integration gated on partner credentials and usage terms.** “Unauthenticated quote” means no sender profile, but Wise's API example still uses a bearer client-credentials token. Do not assume a public anonymous endpoint. If credentials are unavailable, show a clearly labeled published-tariff or user-assumed comparison; do not mark it “live.” |
| Bank comparator | One or more documented bank tariffs for a specific account tier, funding and payout method; enter manually with effective dates and an explicit FX-spread assumption unless an actual bank customer quote is available. | A transfer-fee schedule by itself is insufficient to compute a complete received amount. Do not rank a bank route as fully priced unless its FX rate/spread and all material fees are known or prominently modeled as assumptions. |
| Network condition | [Base JSON-RPC fee history and gas estimation](https://docs.base.org/base-chain/api-reference/rpc-overview) and equivalent Ethereum JSON-RPC methods via a configured RPC provider; quote ETH in source fiat using a timestamped market price. | Applies to self-custody chain sends. A custodial exchange's own crypto withdrawal tariff is the customer-facing charge. Keep gas estimates and exchange charges separate. Network confirmation alone is not recipient cash settlement. |
| Historical sanity check | [World Bank Remittance Prices Worldwide downloads and methodology](https://remittanceprices.worldbank.org/data-download) for supported country corridors. | Snapshot research benchmark only: limited standard amounts and observation dates. Attribute the World Bank as required; never use its survey values as live quotes for arbitrary amounts. |

**Initial feasibility gate:** Before claiming a live end-to-end stablecoin corridor, verify the source-country funding method, source fiat/USDC market, USDC withdrawal on the selected network, recipient USDC deposit on that same network, destination fiat/USDC market, recipient-country fiat cash-out, participant ownership requirements, min/max amounts, and withdrawal holds. A Kraken-based route assumes **two eligible participants with separate verified accounts**; it is not a direct exchange withdrawal into an arbitrary third party's bank. If any leg is unverified, show it as a research scenario or unavailable, not as a recommended real-world route.

**Refresh policy:** Fetch public books on demand with a short cache (target ≤15 seconds); fetch network conditions on demand (target ≤30 seconds); honor provider quote expiry; refresh published tariffs on a scheduled manual review (at least monthly and on provider change); ingest reference FX when released. Times are app freshness policies, not promises made by providers. A route is ineligible for a “current” recommendation if a required executable-price observation is expired or missing. Permit historical replay only with an explicit mode and compatible timestamped inputs.

## 4. Computation and smart route engine

1. Represent route legs as directed graph edges with asset/currency, origin/destination country, provider, custody, funding/payout method, fee formula, time estimate, capacity, eligibility, and data source. Generate only whitelisted, verified path templates (conventional provider transfer; bank wire; fiat → USDC → same-network USDC → fiat). Bound graph search and prohibit loops or hidden cross-chain bridges.
2. Start with `A` = **total amount debited from sender** in source currency. Pay source-side fixed/percentage funding fees from this budget, then convert/trade. After each edge, deduct fees in the currency/asset actually charged; round only at a documented currency/venue precision boundary, never with binary floating point. If a fee is billed separately, include it in `A` by reducing usable principal so all routes share the same total debit. Return recipient's spendable bank amount in target currency.
3. For an order-book buy, walk **asks**; for a sale, walk **bids**. Include the correct percentage trading fee and available depth at every price level. Reject an amount that cannot be filled by the fetched book within the configured impact/depth cap; no fictitious top-of-book fill. Validate base/quote direction and minimum order size. Model slippage from the book; do not then add an arbitrary spread to the same trade.
4. Use a separately timestamped reference rate `R` in target currency per source currency. `reference_received = A × R`; `all_in_cost_source = A − recipient_amount / R`; `all_in_cost_pct = 100 × (1 − recipient_amount / reference_received)`. Show negative values if a route outperforms the reference, with an explanation. Also report `effective_rate = recipient_amount / A`. Display component fees by native currency and source-currency equivalent without counting the same spread twice.
5. Define completion time as elapsed time from **sender starting funding** until **recipient can use the target fiat in their bank**. Sum sequential funding, holds, trade, exchange withdrawal, network, exchange deposit confirmation, second trade, and cash-out legs. Record minimum/typical/maximum or a documented range; account for weekends, provider business hours and explicit holds when data permits. If a material leg has unknown duration, the end-to-end time is `unknown`. A wallet endpoint has a different finish line and label.
6. Build an eligible candidate set only after checking country rules, asset/network compatibility, participant/account assumptions, fees, amount limits, liquidity, source freshness, and destination payout. Return excluded candidates with machine-readable reasons.
7. Route objectives: `MOST_RECEIVED` maximizes target-currency amount; `FASTEST` minimizes typical end-to-end time among routes with a known estimate; `WITHIN_DEADLINE` maximizes recipient amount subject to a user-entered time threshold. Break ties by fresher/more complete inputs, then stable route ID. Return the Pareto frontier as well as the selected route; explain when the cheapest route is slower. Never claim a route is fastest if its completion time is unknown.
8. Sensitivity analysis re-prices the **whole route** at each amount and scenario point; it does not scale a single quote linearly. Vary book depth/impact, FX assumptions, on-chain fees, fiat ramps, and delays independently. Mark counterfactual stress inputs as simulations. Find crossovers using a bounded numeric sweep with interpolation only between valid points; show “no crossover in tested range” when appropriate.

## 5. Architecture and repository

**Monorepo:** `apps/web` (Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, accessible charts such as Recharts), `services/api` (Python, FastAPI, Pydantic, httpx, SQLAlchemy), `packages/contracts` (generated TypeScript types from FastAPI OpenAPI), `infra` (Docker Compose and deployment configuration). Use decimal arithmetic in Python and ISO 8601 UTC timestamps; localize display in the browser.

**Request flow:** browser → Next.js UI → FastAPI → parallel read-only source adapters → normalized immutable snapshot → route calculator and ranker → API response → comparison UI. PostgreSQL stores corridor metadata, provider rule/tariff versions, source observations, scenario definitions, and analysis outputs. An in-process TTL cache is enough for a single-instance demo; Redis is an optional shared cache if multiple API workers are deployed. A scheduled ingestion/review job updates daily FX and tariff status. No LLM is needed for prices or route calculation.

**Backend modules:** `catalog`, `adapters/{ecb,kraken,wise,network,tariffs}`, `provenance`, `pricing`, `eligibility`, `routing`, `sensitivity`, `scenarios`, and `api`. Each adapter handles rate limits, timeout/retry, response validation, and errors without changing calculation logic. Backend-only environment secrets for provider credentials and RPC keys; never return them to the browser.

**Core records:** `Corridor` (countries, currencies, methods); `ProviderCapability` (country, asset, network, account, limit and validity); `TariffVersion` (formula, effective dates, URL, reviewed_at); `Observation` (normalized value, time, source, expiry); `QuoteRun` (inputs, data snapshot IDs, model version, outputs); `RouteResult` and `LegResult` (amounts, fees, timestamps, eligibility); `Scenario` (baseline plus overrides). Store enough to replay a result; avoid storing unnecessary personal data.

## 6. Internal HTTP API (versioned under `/api/v1`)

| Endpoint | Request / response responsibility |
| --- | --- |
| `GET /catalog` | Countries, ISO currency codes, funding/payout methods, USDC networks, route capability flags, allowed amount bands, supported/unsupported explanation. |
| `GET /sources/status` | Adapter health, latest observations, freshness/expiry, credentials configured (boolean only), tariff review dates; no secrets. |
| `POST /comparisons` | Input `{source_country, source_currency, destination_country, destination_currency, send_amount, funding_method, payout_method, objective, deadline_minutes?, mode:"current"}`. Return snapshot metadata, FX reference, eligible routes, excluded routes/reasons, recommended route ID, and Pareto route IDs. |
| `POST /analyses/sensitivity` | Baseline comparison input plus `{amounts?, amount_range?, spread_bps?, network_fee_multiplier?, depth_multiplier?, payout_delay_hours?}` with server-enforced grid limits. Return series, crossover points, route-advantage classifications, source snapshot IDs. |
| `POST /scenarios` | Persist comparison/scenario inputs and immutable data references; return opaque scenario ID/share URL. |
| `GET /scenarios/{id}` | Load inputs, snapshot/version metadata, and calculated outputs. If source data is no longer retained, show stored output and explain replay limitations. |
| `GET /scenarios/{id}/export?format=csv|json` | Export route comparisons and sensitivity points with provenance and assumptions. |
| `GET /health` | Liveness; deployment health can also expose a separate dependency readiness check. |

**Response contract:** Every route has `id, type, provider_steps, eligible, exclusion_codes[], recipient_amount, recipient_currency, total_cost_source, effective_rate, spread_bps, duration{min,typical,max,unit,known}, fee_breakdown[], legs[], input_quality, source_ids[]`. Each leg reports `amount_in/out`, native unit, charged fee and unit, `duration`, source/observation timestamp, and assumption flags. Money is serialized as **decimal strings**, not JSON floating point. Server returns `400/422` for invalid input, `429` for its own rate limiting, and a partial result plus source errors when one independent provider fails; never silently fill missing values.

## 7. Web interface

1. **Comparison form:** Two country/currency selectors, send amount, method selectors, route objective, optional time limit. Default to CAD → EUR, bank → bank if the catalog says it is covered; otherwise choose the first verified corridor. Show currency names and codes; label network and account prerequisites.
2. **Results summary:** “Most received,” “Fastest known,” and “Recommended” cards with recipient amount, all-in cost and estimated end-to-end time. Show the latest market snapshot time and a prominent simulation/quote-status label. A status panel states which routes lack data.
3. **Comparison table:** Conventional and stablecoin routes as rows; sort by recipient amount, cost, or time. Show funding, trading/FX, crypto/network, withdrawal, and recipient charges as separate columns. Clicking a row opens a timeline, every fee and source, limits, hold assumptions, and bid/ask depth impact.
4. **Research view:** Amount-vs-cost and amount-vs-time plots, break-even annotations, and a heatmap for amount versus fee/congestion or FX conditions. Controls recompute server-side; chart tooltips include exact values and data labels. Accessibility includes keyboard controls, table alternatives, readable color contrasts and mobile layout.
5. **Methodology/source drawer:** Formula definitions, provider links, observation timestamps, fee tier, confidence/availability, and the distinction between quote, estimate, tariff, benchmark and scenario override. Unknown times/fees have explicit text, never zero by default.
6. **Share/export:** Copy a scenario URL and download CSV/JSON; shared views are read-only and display the originally used snapshot rather than silently refreshing it.

## 8. Operational and quality requirements

- **Correctness:** Decimal arithmetic; explicit units and direction for every FX conversion; currency-specific display precision; deterministic results for stored snapshots; protection against double-counting exchange withdrawal/gas and spread/trading fee. Fixture tests cover buy/sell book traversal, fixed-fee dominance at small amounts, depth exhaustion, two-account requirement, withdrawal hold, fee currency, inverse pairs, unavailable routes, and crossover computation.
- **Freshness and reliability:** Per-adapter timeout and circuit protection, response-level expiry, rate-limit aware caching, useful partial results, and observable provider errors. No live badge for a stale snapshot. Store source retrieval errors without leaking secrets.
- **Security:** Read-only provider credentials, backend-only secrets, input and grid-size limits, request throttling, CORS restricted to the app origin, generated scenario IDs with sufficient entropy, and no sensitive recipient/bank data. Dependencies are pinned and checked in CI.
- **Performance target:** Cached comparison p95 under 2 seconds; uncached comparison target under 5 seconds when upstreams respond; sensitivity grid capped at 100 points in MVP. These are product targets to verify in staging, not claims about external providers.
- **Documentation:** Architecture diagram, OpenAPI docs, a source/credential setup guide, methodology and known-data-gaps page, seed tariff review procedure, and reproducible demo fixtures. Docker Compose starts web, API and PostgreSQL locally. CI runs type checks, API unit tests, contract checks, and one end-to-end happy-path test with fixed data.
- **Disclosure:** Every result says “Simulation / estimate, not a payment quote.” Display modeled provider/market risks such as liquidity gaps, withdrawal holds and stablecoin price deviations alongside affected assumptions, without assigning unsupported probabilities.

## 9. Delivery slices and acceptance

**Slice A — calculation and data:** Shared schema, reference FX adapter, public order-book adapter, versioned fee/method catalog, deterministic route graph/calculator, `/catalog` and `/comparisons`, fixed-data tests. Show real-time market pricing only where the feed is active; ship an explicit assumed comparator if a conventional quote integration is not available.

**Slice B — user experience:** Comparison form, quote/source labels, side-by-side table, route breakdown, excluded-route reasons, objective selector, responsive UI, and end-to-end completion-time estimates where supported.

**Slice C — research:** Sensitivity API, amount curves/heatmap, break-even logic, saved reproducible snapshots, export, source-status display, deployment and methodology docs.

**Agent work packages:**

| Agent | Owned deliverable | Contract/dependency |
| --- | --- | --- |
| Data integrations | ECB/BoC, Kraken book and tariff, network, optional Wise, and curated funding/payout adapters; fixture payloads and source-status rules. | Returns normalized observations and capability records; no pricing or UI logic. Verify access and source terms first. |
| Pricing/routing | Decimal-based leg calculator, eligibility graph, objective ranking, provenance propagation, sensitivity and unit fixtures. | Consumes normalized observations; publishes Pydantic models and OpenAPI; can begin against fixed fixtures. |
| API/storage | FastAPI endpoints, PostgreSQL schema, scenario snapshots/export, caching, errors, rate limits and health. | Imports route engine and generated response schemas; owns migrations and integration tests. |
| Frontend | Next.js form, result cards/table, breakdown, charts, accessibility and scenario sharing. | Generate TS types from OpenAPI; develop against fixed response fixtures until API integration. |
| QA/integration | Cross-currency sample calculations, source failure scenarios, end-to-end tests, docs, deployment and source freshness checks. | Uses published API contract and fixed data; validates all release-gate cases. |

Agree on the `Observation`, `LegResult`, `RouteResult`, and endpoint schemas before parallel implementation; the pricing engine owns financial arithmetic, while adapters supply facts and the UI only formats returned values.

**Release gate:** For at least **two documented country corridors** and **three send amounts** (small, medium, large), a reviewer can reproduce all displayed recipient amounts from the recorded inputs; see a conventional and USDC route only when every leg is verified or explicitly assumed; observe a route rerank after changing amount or congestion; distinguish actual refreshed market prices from published tariffs; see end-to-end time or “Unknown”; and retrieve a saved/exported scenario with provenance. If provider credentials or region-specific cash-out data are missing, ship the working simulator with clear estimates and mark those routes unavailable for current recommendations instead of inventing live values.

## 10. External references checked for this specification

- [Kraken order book API](https://docs.kraken.com/api-reference/market-data/get-order-book), [Kraken fee schedule](https://www.kraken.com/features/fee-schedule), [Kraken funding and withdrawals](https://support.kraken.com/articles/360000381846-cash-deposit-options-fees-minimums-and-processing-times-).
- [Wise display quotes](https://docs.wise.com/guides/product/send-money/quotes/unauthenticated-quote) and [Wise API access requirements](https://docs.wise.com/guides/developer/auth-and-security).
- [ECB reference FX](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [Base RPC overview](https://docs.base.org/base-chain/api-reference/rpc-overview), and [World Bank remittance survey methodology](https://remittanceprices.worldbank.org/node/20237).

Provider availability, API versions, tariffs, and permitted use must be reconfirmed during implementation; this document specifies adapter behavior and acceptance, not a claim that credentials or all corridors are already available.
