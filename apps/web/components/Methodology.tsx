"use client";

import type { Catalog } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { chainSym, venueSym } from "@/lib/format";
import { cn, ErrorNote, Glyph, Panel, PanelHead, Seg, Skeleton, Tag } from "./ui/kit";

const LABELS: [string, string, "up" | "usdc" | "warn" | "neutral"][] = [
  ["Live order book", "Public exchange depth fetched for this snapshot; indicative, and can move before an order.", "up"],
  ["Provider estimate", "A provider's display quote (for example Wise with partner credentials); the final price is set at payment.", "usdc"],
  ["Published fee", "A versioned tariff from provider documentation, with its effective date. “Unreviewed seed” means not yet re-checked by a person.", "usdc"],
  ["ECB daily reference", "Analytical benchmark mid-rate, never an executable customer rate.", "up"],
  ["Assumption", "An explicit modelling assumption (bank FX margin, delivery times, Wise fee without the API). Editable where possible.", "warn"],
  ["Simulation", "A counterfactual stress input from the Stress lab (congestion, depth, spread, delays). Results are simulations.", "warn"],
];

const FORMULAS: [string, string][] = [
  ["R", "reference mid (target per source) = (target per EUR) / (source per EUR), ECB"],
  ["reference_received", "A × R"],
  ["all_in_cost_source", "A − recipient_amount / R"],
  ["all_in_cost_pct", "100 × (1 − recipient_amount / reference_received)"],
  ["effective_rate", "recipient_amount / A"],
  ["spread_bps", "10 000 × (1 − gross conversion rate excl. fees / R)"],
];

const STEPS = [
  ["Fund", "Sender bank → venue V1 over a local rail (Interac, ACH, SEPA…)"],
  ["Buy", "Walk the asks of V1's USDC/fiat book (or bids on an inverse book)"],
  ["Withdraw", "V1 sends native USDC on chain N; the exchange fee covers gas"],
  ["Settle", "Confirmations on N, credited at venue V2"],
  ["Sell", "Walk the bids of V2's USDC/fiat book"],
  ["Pay out", "V2 → recipient bank in the account holder's own name"],
];

const p = "mt-1.5 text-[13px] leading-[21px] text-muted";
const h3 = "mt-6 text-[13px] font-semibold";

export function Methodology() {
  const [c, setC] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [basis, setBasis] = useState<"all" | "assumed" | "unreviewed">("all");
  useEffect(() => void api.catalog().then(setC).catch((e) => setErr(e.message)), []);
  const nets = c?.networks ?? [];
  const tariffs = (c?.tariffs ?? []).filter((t) => basis === "all" || (basis === "assumed" ? t.basis === "user_assumption" : !t.reviewed_at));

  return (
    <div className="space-y-3 pt-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-1 max-w-[80ch] text-[12.5px] text-muted">
          How every route is priced from the same total sender debit to the recipient&apos;s spendable bank balance, and where the data comes from.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-12">
        <Panel className="p-5 lg:col-span-7">
          <h2 className="text-[15px] font-semibold">The question</h2>
          <p className={p}>
            Under what transaction sizes and market conditions does a native-USDC route deliver more recipient money, faster usable settlement, or
            both, than a conventional route? Every route starts from the same <b className="text-text">total sender debit A</b> in the source
            currency and ends at the recipient&apos;s <b className="text-text">spendable bank balance</b> in the target currency.
          </p>

          <dl className="mt-4 overflow-hidden rounded-xl border border-line">
            {FORMULAS.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[170px_minmax(0,1fr)] border-t border-line first:border-0">
                <dt className="num bg-panel-2 px-3 py-2 text-[12px] text-usdc-ink">{k}</dt>
                <dd className="num px-3 py-2 text-[12px]">= {v}</dd>
              </div>
            ))}
          </dl>
          <p className={p}>
            A negative cost means a route beat the daily reference (markets move after the ECB fixing). Fees are deducted in the unit actually
            charged; rounding happens only at currency precision boundaries, with Decimal arithmetic and never binary floats. The fee
            breakdown&apos;s implied line is the residual between all-in cost and explicit fees, so spread and trading fee are never counted twice.
          </p>

          <h3 className={h3}>The USDC route template</h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {STEPS.map(([k, v], i) => (
              <li key={k} className="rounded-lg border border-line bg-panel-2/60 p-3">
                <div className="eyebrow">
                  {String(i + 1).padStart(2, "0")} · {k}
                </div>
                <div className="mt-1 text-[12px] leading-[17px] text-muted">{v}</div>
              </li>
            ))}
          </ol>
          <p className={p}>
            V1 and V2 can be different exchanges; the router searches every venue pair × shared native-USDC network × funding/payout rail. Templates
            are whitelisted: no loops, no bridges. Conventional comparators are Wise (pay-in, conversion at mid plus fee, local payout) and a retail
            SWIFT wire (outgoing fee, bank FX margin, correspondent deduction, receiving fee). A USDC route assumes two eligible participants with
            separate verified accounts. Fills beyond fetched depth or the price-impact cap are rejected, never filled at top of book.
          </p>

          <h3 className={h3}>Completion time</h3>
          <p className={p}>
            From the sender starting funding until the recipient can use the fiat. Legs are simulated from the chosen start time for minimum, typical
            and maximum, applying each rail&apos;s business hours and weekends (public holidays are not modelled). Holds after funding are explicit
            legs. Any unknown material leg makes the route time <b className="text-text">Unknown</b>, and unknown-time routes are never called
            fastest. The trace splits the typical time into legs actually running and time waiting on rail calendars.
          </p>

          <h3 className={h3}>Recommendation grade</h3>
          <p className={p}>
            <b className="text-text">Current</b> requires live prices, documented capabilities, human-reviewed tariffs and no overrides. Anything
            else is a <b className="text-text">research scenario</b>. Until seed tariffs are reviewed (docs/tariff-review.md), every route is
            research-grade by design.
          </p>
        </Panel>

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
          <Panel>
            <PanelHead title="Data labels" sub="The label beside every figure says how much to trust it." />
            <dl className="px-4 pb-2">
              {LABELS.map(([k, v, t]) => (
                <div key={k} className="border-t border-line py-2.5">
                  <dt>
                    <Tag tone={t}>{k}</Tag>
                  </dt>
                  <dd className="mt-1 text-[12px] leading-[18px] text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel className="p-4">
            <h2 className="text-[13px] font-semibold">Known data gaps</h2>
            <ul className="mt-2 space-y-1.5 text-[12px] leading-[18px] text-muted">
              {[
                ...(c?.notes ?? []),
                "Wise pricing is a published-tariff assumption unless partner credentials are configured (WISE_API_TOKEN).",
                "Bank wire FX margin, correspondent and receiving fees are assumptions until a real bank customer quote is entered.",
                "L2 gas estimates exclude the L1 data-availability fee; they are informational only (exchange withdrawal fees apply).",
                "Public holidays, per-user limits and tiers, and first-transfer verification holds are not modelled.",
                "World Bank Remittance Prices Worldwide is a historical benchmark only and is not used as a quote.",
              ].map((n) => (
                <li key={n} className="flex gap-2">
                  <span aria-hidden className="text-warn">△</span>
                  {n}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {err && <ErrorNote title="Couldn't load the catalog.">{err}</ErrorNote>}
      {!c && !err && <Skeleton className="h-72 w-full rounded-xl" />}
      {c && (
        <>
          <Panel aria-labelledby="m-venues">
            <PanelHead
              id="m-venues"
              title="Venue × chain matrix"
              sub="USDC withdrawal fee per network, in USDC (seed tariffs). A dashed cell is assumed support. Chains without native Circle USDC are excluded from routing."
            />
            <div className="scroll-thin overflow-x-auto px-4 pb-4">
              <table className="w-full min-w-[960px] border-separate border-spacing-[2px] text-[12px]">
                <thead>
                  <tr>
                    <th className="eyebrow w-48 pb-1 text-left font-normal">Venue · taker</th>
                    {nets.map((n) => (
                      <th key={n.id} className="pb-1 font-normal" title={`${n.name}: ${n.note}`}>
                        <span className="flex flex-col items-center gap-1">
                          <Glyph kind="chain" size="sm" text={chainSym(n.id).slice(0, 4)} />
                          <span className={cn("text-[10px]", n.native_usdc ? "text-faint" : "text-down line-through")}>{n.name.split(" ")[0]}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.venues.map((v) => (
                    <tr key={v.id}>
                      <td className="py-1 pr-2">
                        <span className="flex items-center gap-2">
                          <Glyph kind="venue" text={venueSym(v.id)} />
                          <span className="min-w-0">
                            <a className="block truncate font-medium hover:underline" href={v.url} target="_blank" rel="noreferrer">
                              {v.name}
                            </a>
                            <span className="num text-[10.5px] text-faint">
                              {v.taker_fee_pct}% {v.taker_fee_reviewed ? "reviewed" : "seed"} · {Object.keys(v.fiat_market).join(" ")}
                            </span>
                          </span>
                        </span>
                      </td>
                      {nets.map((n) => {
                        const vn = v.networks.find((x) => x.network === n.id);
                        if (!vn) return <td key={n.id} className="hatch h-9 rounded opacity-40" />;
                        return (
                          <td
                            key={n.id}
                            title={`${v.name} on ${n.name}: ${vn.withdraw_fee_usdc} USDC fee, min ${vn.withdraw_min}; ${vn.status}`}
                            className={cn("num h-9 rounded text-center", vn.status === "assumed" ? "border border-dashed border-line-2" : "bg-usdc-soft text-usdc-ink")}
                          >
                            {vn.withdraw_fee_usdc}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel aria-labelledby="m-tariffs">
            <PanelHead
              id="m-tariffs"
              title="Tariff versions"
              sub={`Catalog ${c.version}. Every fee has an effective date and a source; Reviewed stays empty until a person re-checks it.`}
              right={
                <Seg
                  label="Filter tariffs"
                  size="sm"
                  value={basis}
                  onChange={setBasis}
                  options={[
                    { value: "all", label: `All ${c.tariffs.length}` },
                    { value: "unreviewed", label: "Unreviewed" },
                    { value: "assumed", label: "Assumptions" },
                  ]}
                />
              }
            />
            <div className="scroll-thin max-h-[560px] overflow-auto">
              <table className="w-full min-w-[860px] text-[12px]">
                <thead className="sticky top-0 bg-panel">
                  <tr className="eyebrow">
                    <th className="py-2 pl-4 text-left font-normal">Provider</th>
                    <th className="py-2 text-left font-normal">Component</th>
                    <th className="py-2 pr-3 text-right font-normal">Formula</th>
                    <th className="py-2 text-left font-normal">Basis</th>
                    <th className="py-2 pr-3 text-right font-normal">Effective</th>
                    <th className="py-2 pr-4 text-right font-normal">Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {tariffs.map((t, i) => (
                    <tr key={i} className="border-t border-line hover:bg-hover">
                      <td className="py-1.5 pl-4">{t.provider}</td>
                      <td className="py-1.5 text-muted">
                        {t.source_url ? (
                          <a className="hover:text-text hover:underline" href={t.source_url} target="_blank" rel="noreferrer">
                            {t.description}
                          </a>
                        ) : (
                          t.description
                        )}
                      </td>
                      <td className="num py-1.5 pr-3 text-right whitespace-nowrap">
                        {t.fixed !== "0" ? `${t.fixed} ${t.unit}` : ""}
                        {t.fixed !== "0" && t.pct !== "0" ? " + " : ""}
                        {t.pct !== "0" ? `${t.pct}%` : t.fixed === "0" ? <span className="text-faint">free</span> : ""}
                      </td>
                      <td className="py-1.5">{t.basis === "user_assumption" ? <Tag tone="warn">Assumption</Tag> : <span className="text-faint">Published</span>}</td>
                      <td className="num py-1.5 pr-3 text-right text-muted">{t.effective_date}</td>
                      <td className="num py-1.5 pr-4 text-right">{t.reviewed_at ?? <span className="text-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
