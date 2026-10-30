"use client";

import type { Catalog } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Canvas, PageHeader } from "./Shell";
import { Badge, Card, CardHeader, Skeleton } from "./ui";

const LABELS = [
  ["Live order book", "Public exchange depth fetched for this snapshot; indicative, and can move before an order."],
  ["Provider estimate", "A provider's display quote (for example Wise with partner credentials); the final price is set at payment."],
  ["Published fee", "A versioned tariff from provider documentation, with its effective date. “Unreviewed seed” means not yet re-checked by a person."],
  ["ECB daily reference", "Analytical benchmark mid-rate, never an executable customer rate."],
  ["Assumption", "An explicit modelling assumption (bank FX margin, delivery times, Wise fee without the API). Editable where possible."],
  ["Scenario override", "A counterfactual stress input (congestion, depth, spread, delays). Results are simulations."],
];

const FORMULAS = `R                  = reference mid (target per source) = (target per EUR) / (source per EUR), ECB
reference_received = A × R
all_in_cost_source = A − recipient_amount / R
all_in_cost_pct    = 100 × (1 − recipient_amount / reference_received)
effective_rate     = recipient_amount / A
spread_bps         = 10 000 × (1 − gross conversion rate excl. fees / R)`;

const h3 = "mt-6 text-sm font-semibold";
const p = "mt-1.5 text-sm leading-6";

export function Methodology() {
  const [c, setC] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => void api.catalog().then(setC).catch((e) => setErr(e.message)), []);
  return (
    <Canvas>
      <PageHeader
        title="Methodology"
        sub="How every route is priced from the same total sender debit to the recipient's spendable bank balance, and where the data comes from."
      />
      <div className="grid items-start gap-3 lg:grid-cols-12">
        <Card className="min-w-0 p-5 lg:col-span-7" aria-labelledby="m-q">
          <h2 id="m-q" className="text-base font-semibold">The question and the formulas</h2>
          <p className={p}>
            Under what transaction sizes and market conditions does a native-USDC route deliver more recipient money, faster usable settlement, or
            both, than a conventional route? Every route starts from the same <b>total sender debit A</b> in the source currency and ends at the
            recipient&apos;s <b>spendable bank balance</b> in the target currency.
          </p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-md bg-surface-2 p-4 text-xs leading-5">
            <code className="font-mono">{FORMULAS}</code>
          </pre>
          <p className={p}>
            A negative cost means a route beat the daily reference (markets move after the ECB fixing). Fees are deducted in the unit actually charged;
            rounding happens only at currency precision boundaries, with Decimal arithmetic and never binary floats. The fee table&apos;s implied line is
            the residual between all-in cost and explicit fees, so spread and trading fee are never counted twice.
          </p>

          <h3 className={h3}>Route templates (whitelisted; no loops, no bridges)</h3>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm leading-6">
            <li>Conventional provider (Wise): pay-in, conversion at mid plus fee, local payout.</li>
            <li>Retail bank SWIFT wire: outgoing fee, bank FX margin, correspondent deduction, receiving fee.</li>
            <li>
              USDC: fund venue V1, buy USDC (walk <b>asks</b>, or bids on an inverse fiat/USDC book), withdraw from V1 on network N (the exchange fee
              covers gas, which is never added again), confirmations, deposit at V2, sell USDC (walk <b>bids</b>), fiat cash-out. V1 and V2 can be
              different exchanges; the router searches every venue pair × shared native-USDC network.
            </li>
          </ul>
          <p className={p}>
            A USDC route assumes two eligible participants with separate verified accounts; exchanges only pay out to a bank account in the account
            holder&apos;s own name. Fills beyond fetched depth or the price-impact cap are rejected, never filled at top of book.
          </p>

          <h3 className={h3}>Completion time</h3>
          <p className={p}>
            From the sender starting funding until the recipient can use the fiat. Legs are simulated from the chosen start time for minimum, typical
            and maximum, applying each rail&apos;s business hours and weekends (public holidays are not modelled). Holds after funding are explicit legs.
            Any unknown material leg makes the route time <b>Unknown</b>, and unknown-time routes are never called fastest.
          </p>

          <h3 className={h3}>Recommendation grade</h3>
          <p className={p}>
            <b>Current</b> requires live prices, documented capabilities, human-reviewed tariffs and no overrides. Anything else is a{" "}
            <b>research scenario</b>. Until seed tariffs are reviewed (docs/tariff-review.md), every route is research-grade by design.
          </p>
        </Card>

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
          <Card aria-labelledby="m-labels">
            <CardHeader id="m-labels" title="Data labels" sub="The label beside every figure says how much to trust it." />
            <dl className="px-5 pb-2">
              {LABELS.map(([k, v]) => (
                <div key={k} className="border-t border-rule py-3">
                  <dt className="text-sm font-medium">{k}</dt>
                  <dd className="mt-0.5 text-[13px] leading-5 text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card aria-labelledby="m-gaps" className="p-5">
            <h2 id="m-gaps" className="text-base font-semibold">Known data gaps</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-5 text-muted">
              {c?.notes.map((n) => <li key={n}>{n}</li>)}
              <li>Wise pricing is a published-tariff assumption unless partner credentials are configured (WISE_API_TOKEN).</li>
              <li>Bank wire FX margin, correspondent and receiving fees are assumptions until a real bank customer quote is entered.</li>
              <li>L2 gas estimates exclude the L1 data-availability fee; they are informational only (exchange withdrawal fees apply).</li>
              <li>Public holidays, per-user limits and tiers, and first-transfer verification holds are not modelled.</li>
              <li>World Bank Remittance Prices Worldwide is a historical benchmark only and is not used as a quote.</li>
            </ul>
          </Card>
        </div>
      </div>

      {err && (
        <p role="alert" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="font-medium text-danger">Couldn&apos;t load the catalog.</span> {err}
        </p>
      )}
      {!c && !err && <Skeleton className="h-72 w-full rounded-lg" />}
      {c && (
        <>
          <Card aria-labelledby="m-venues">
            <CardHeader
              id="m-venues"
              title="Venues × native-USDC networks"
              sub="USDC withdrawal fee per network (seed tariffs). * marks assumed support. Networks without native Circle USDC are excluded."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="h-10 pl-5 pr-2 text-left font-normal">Venue</th>
                    <th className="h-10 px-2 text-left font-normal">Fiat books</th>
                    <th className="h-10 px-2 text-right font-normal">Taker</th>
                    {c.networks.map((n) => (
                      <th key={n.id} className="h-10 px-2 text-right font-normal" title={n.note}>
                        {n.name}
                        {!n.native_usdc && <span className="block text-danger">not native</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.venues.map((v) => (
                    <tr key={v.id} className="border-b border-rule last:border-0">
                      <td className="py-2.5 pl-5 pr-2 font-medium">
                        <a className="hover:underline" href={v.url} target="_blank" rel="noreferrer">{v.name}</a>
                      </td>
                      <td className="px-2 py-2.5 text-muted">{Object.entries(v.fiat_market).map(([k, m]) => (m === "conversion" ? `${k} (1:1)` : k)).join(", ")}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular">
                        {v.taker_fee_pct}% <span className="text-xs text-muted">{v.taker_fee_reviewed ? "reviewed" : "seed"}</span>
                      </td>
                      {c.networks.map((n) => {
                        const vn = v.networks.find((x) => x.network === n.id);
                        return (
                          <td key={n.id} className="px-2 py-2.5 text-right tabular">
                            {vn ? `${vn.withdraw_fee_usdc}${vn.status === "assumed" ? "*" : ""}` : <span className="text-muted">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card aria-labelledby="m-tariffs">
            <CardHeader
              id="m-tariffs"
              title="Tariff versions"
              sub={`Catalog ${c.version}. Every fee has an effective date and a source; Reviewed stays empty until a person re-checks it.`}
            />
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="h-10 pl-5 pr-2 text-left font-normal">Provider</th>
                    <th className="h-10 px-2 text-left font-normal">Component</th>
                    <th className="h-10 px-2 text-right font-normal">Formula</th>
                    <th className="h-10 px-2 text-left font-normal">Basis</th>
                    <th className="h-10 px-2 text-right font-normal">Effective</th>
                    <th className="h-10 pl-2 pr-5 text-right font-normal">Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {c.tariffs.map((t, i) => (
                    <tr key={i} className="border-b border-rule last:border-0">
                      <td className="py-2 pl-5 pr-2">{t.provider}</td>
                      <td className="px-2 py-2">
                        {t.source_url ? <a className="hover:underline" href={t.source_url} target="_blank" rel="noreferrer">{t.description}</a> : t.description}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular">
                        {t.fixed !== "0" ? `${t.fixed} ${t.unit}` : ""}
                        {t.fixed !== "0" && t.pct !== "0" ? " + " : ""}
                        {t.pct !== "0" ? `${t.pct}%` : t.fixed === "0" ? "free" : ""}
                      </td>
                      <td className="px-2 py-2">{t.basis === "user_assumption" ? <Badge tone="warn">Assumption</Badge> : <span className="text-muted">Published</span>}</td>
                      <td className="px-2 py-2 text-right tabular">{t.effective_date}</td>
                      <td className="py-2 pl-2 pr-5 text-right tabular">{t.reviewed_at ?? <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </Canvas>
  );
}
