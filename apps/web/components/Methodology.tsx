"use client";

import type { Catalog } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, CardHeader, Spinner } from "./ui";

const LABELS = [
  ["Live order book", "Public exchange depth fetched for this snapshot; indicative, can move before an order."],
  ["Provider estimate", "A provider's display quote (e.g. Wise with partner credentials); final price set at payment."],
  ["Published fee", "A versioned tariff from provider documentation, with effective date. “Unreviewed seed” = not yet re-checked by a human."],
  ["ECB daily reference", "Analytical benchmark mid-rate — never an executable customer rate."],
  ["Assumption", "Explicit modelling assumption (bank FX margin, delivery times, Wise fee without API). Editable where possible."],
  ["Scenario override", "Counterfactual stress input (congestion, depth, spread, delays). Results are simulations."],
];

export function Methodology() {
  const [c, setC] = useState<Catalog | null>(null);
  useEffect(() => void api.catalog().then(setC), []);
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-5 pb-10 pt-4 text-sm leading-relaxed">
      <Card className="p-5">
        <h1 className="text-base font-semibold">Methodology</h1>
        <p className="mt-2 text-muted">
          Question: under what transaction sizes and market conditions does a native-USDC route deliver more recipient money and/or faster
          usable settlement than a conventional route? Every route starts from the same <b>total sender debit A</b> (source currency) and ends
          at the recipient&apos;s <b>spendable bank balance</b> (target currency).
        </p>
        <h2 className="mt-4 font-semibold">Formulas</h2>
        <ul className="mt-1 list-inside list-disc font-mono text-xs">
          <li>R = reference mid (target per source) = (target per EUR) / (source per EUR), ECB</li>
          <li>reference_received = A × R</li>
          <li>all_in_cost_source = A − recipient_amount / R</li>
          <li>all_in_cost_pct = 100 × (1 − recipient_amount / reference_received)</li>
          <li>effective_rate = recipient_amount / A</li>
          <li>spread_bps = 10 000 × (1 − gross conversion rate excl. fees / R)</li>
        </ul>
        <p className="mt-2 text-muted">
          Negative cost means a route beat the daily reference (markets move after the ECB fixing). Fees are deducted in the unit actually charged;
          rounding happens only at currency precision boundaries (Decimal arithmetic, never binary floats). The fee table&apos;s “implied” line is the
          residual between all-in cost and explicit fees, so spread and trading fee are never counted twice.
        </p>
        <h2 className="mt-4 font-semibold">Route templates (whitelisted; no loops, no bridges)</h2>
        <ol className="mt-1 list-inside list-decimal text-muted">
          <li>Conventional provider (Wise): pay-in → conversion at mid + fee → local payout.</li>
          <li>Retail bank SWIFT wire: outgoing fee → bank FX margin → correspondent deduction → receiving fee.</li>
          <li>
            USDC: fund venue V1 → buy USDC (walk <b>asks</b>, or bids on an inverse fiat/USDC book) → V1 withdrawal on network N (exchange fee
            covers gas; gas never added again) → confirmations → V2 deposit → sell USDC (walk <b>bids</b>) → fiat cash-out. V1 and V2 can be
            different exchanges; the router searches every venue pair × shared native-USDC network.
          </li>
        </ol>
        <p className="mt-2 text-muted">
          A USDC route assumes two eligible participants with separate verified accounts; exchanges only pay out to a bank account in the account
          holder&apos;s own name. Fills beyond fetched depth or the price-impact cap are rejected, never filled at top of book.
        </p>
        <h2 className="mt-4 font-semibold">Completion time</h2>
        <p className="text-muted">
          From sender starting funding until the recipient can use the fiat. Legs are simulated from the chosen start time for min / typical / max,
          applying each rail&apos;s business hours and weekends (public holidays not modelled). Holds after funding are explicit legs. Any unknown
          material leg makes the route time <b>Unknown</b>, and unknown-time routes are never called fastest.
        </p>
        <h2 className="mt-4 font-semibold">Recommendation grade</h2>
        <p className="text-muted">
          <b>Current</b> requires live prices, documented capabilities, human-reviewed tariffs and no overrides. Anything else is a{" "}
          <b>research scenario</b>. Until seed tariffs are reviewed (docs/tariff-review.md), all routes are research-grade by design.
        </p>
      </Card>

      <Card>
        <CardHeader title="Data labels" />
        <dl className="grid gap-2 p-4 md:grid-cols-2">
          {LABELS.map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium">{k}</dt>
              <dd className="text-xs text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {!c ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <CardHeader title="Venues × native-USDC networks" sub="Withdrawal fee in USDC (seed tariffs). ✱ = assumed support. Networks without native Circle USDC are excluded." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Venue</th>
                    <th className="px-2 py-1.5 text-left">Fiat books</th>
                    <th className="px-2 py-1.5 text-left">Taker</th>
                    {c.networks.map((n) => (
                      <th key={n.id} className="px-2 py-1.5" title={n.note}>
                        {n.name}
                        {!n.native_usdc && <span className="block text-danger">not native</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.venues.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium"><a className="underline" href={v.url} target="_blank" rel="noreferrer">{v.name}</a></td>
                      <td className="px-2 py-1.5">{Object.entries(v.fiat_market).map(([k, m]) => (m === "conversion" ? `${k} (1:1)` : k)).join(", ")}</td>
                      <td className="px-2 py-1.5 tabular">{v.taker_fee_pct}% {v.taker_fee_reviewed ? <Badge tone="ok">reviewed</Badge> : <Badge tone="warn">seed</Badge>}</td>
                      {c.networks.map((n) => {
                        const vn = v.networks.find((x) => x.network === n.id);
                        return (
                          <td key={n.id} className="px-2 py-1.5 text-center tabular">
                            {vn ? `${vn.withdraw_fee_usdc}${vn.status === "assumed" ? "✱" : ""}` : <span className="text-muted">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Tariff versions" sub={`Catalog ${c.version}. Every fee has an effective date and source; reviewed_at is empty until a human re-checks it.`} />
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[800px] text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5">Provider</th><th className="px-2 py-1.5">Component</th><th className="px-2 py-1.5">Formula</th>
                    <th className="px-2 py-1.5">Basis</th><th className="px-2 py-1.5">Effective</th><th className="px-2 py-1.5">Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {c.tariffs.map((t, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{t.provider}</td>
                      <td className="px-2 py-1">{t.source_url ? <a className="underline" href={t.source_url} target="_blank" rel="noreferrer">{t.description}</a> : t.description}</td>
                      <td className="px-2 py-1 tabular">{t.fixed !== "0" ? `${t.fixed} ${t.unit}` : ""}{t.fixed !== "0" && t.pct !== "0" ? " + " : ""}{t.pct !== "0" ? `${t.pct}%` : t.fixed === "0" ? "free" : ""}</td>
                      <td className="px-2 py-1">{t.basis === "user_assumption" ? <Badge tone="warn">assumption</Badge> : <Badge>published</Badge>}</td>
                      <td className="px-2 py-1">{t.effective_date}</td>
                      <td className="px-2 py-1">{t.reviewed_at ?? <span className="text-warn">not yet</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Known data gaps</h2>
            <ul className="mt-1 list-inside list-disc text-muted">
              {c.notes.map((n) => <li key={n}>{n}</li>)}
              <li>Wise pricing is a published-tariff assumption unless partner credentials are configured (WISE_API_TOKEN).</li>
              <li>Bank wire FX margin, correspondent and receiving fees are assumptions until a real bank customer quote is entered.</li>
              <li>L2 gas estimates exclude the L1 data-availability fee; they are informational only (exchange withdrawal fees apply).</li>
              <li>Public holidays, per-user limits/tiers, and first-transfer verification holds are not modelled.</li>
              <li>World Bank Remittance Prices Worldwide is a historical benchmark only and is not used as a quote.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
