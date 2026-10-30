"use client";

import type { LegResult, RouteResult } from "@sim/contracts";
import { durationRange, minutes, money, pct, ROUTE_TYPE_LABEL, statusLabel, when } from "@/lib/format";
import { networkName, QualityBadge } from "./Results";
import { Badge, Chevron } from "./ui";

function statusTone(s: LegResult["source_status"]) {
  return s === "live_api" || s === "provider_estimate" ? "ok" : s === "published_tariff" ? "neutral" : "warn";
}

const well = "mt-2 rounded-md bg-surface-2 p-3 text-[13px] leading-5";
const sub = "flex cursor-pointer items-center gap-1 text-muted hover:text-text";

function Detail({ leg }: { leg: LegResult }) {
  const d = (leg.detail ?? {}) as Record<string, unknown>;
  if (leg.kind === "trade") {
    const levels = (d.levels as { price: string; qty: string }[] | undefined) ?? [];
    return (
      <div className={well}>
        <p className="tabular text-muted">
          <span className="text-text">{String(d.symbol)}</span> · {String(d.side)} · VWAP {String(d.vwap)} · impact {String(d.impact_bps)} bps
        </p>
        <details className="group mt-2">
          <summary className={sub}><Chevron className="transition group-open:rotate-90" />Fill details</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular sm:grid-cols-3">
            <span>Orientation: {String(d.book_orientation)}</span>
            <span>Taker fee: {String(d.taker_fee_pct)}%</span>
            <span>Mid: {String(d.mid)}</span>
            <span>Best: {String(d.best_price)}</span>
            <span>Worst level: {String(d.worst_price)}</span>
            <span>Levels consumed: {String(d.levels_used)}</span>
          </div>
        </details>
        {levels.length > 0 && (
          <details className="group mt-2">
            <summary className={sub}><Chevron className="transition group-open:rotate-90" />Depth consumed ({levels.length} level{levels.length > 1 ? "s" : ""} shown)</summary>
            <table className="mt-1 w-full tabular">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="text-right font-normal">Price</th>
                  <th className="text-right font-normal">Quantity taken (base)</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={i}>
                    <td className="text-right">{l.price}</td>
                    <td className="text-right">{Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        {typeof d.fee_schedule_url === "string" && (
          <a className="mt-2 inline-block text-muted underline underline-offset-2 hover:text-text" href={d.fee_schedule_url} target="_blank" rel="noreferrer">
            Fee schedule
          </a>
        )}
      </div>
    );
  }
  if (leg.kind === "network") {
    return (
      <div className={well}>
        {d.self_custody_gas_usd ? (
          <p>
            Self-custody gas estimate for one USDC transfer:{" "}
            <b className="tabular">${Number(d.self_custody_gas_usd).toPrecision(3)}</b> ({String(d.fee_native)} {String(d.gas_token)} @ $
            {Number(d.gas_token_usd).toLocaleString()}) — informational; the exchange withdrawal fee is what the sender pays.
            {typeof d.note === "string" && <span className="block text-muted">{d.note}</span>}
          </p>
        ) : (
          <p className="text-muted">Gas estimate unavailable{d.gas_estimate_error ? `: ${String(d.gas_estimate_error)}` : ""}.</p>
        )}
        <p className="mt-1 break-all text-muted">USDC contract: <span className="font-mono text-xs">{String(d.usdc_contract ?? "—")}</span></p>
      </div>
    );
  }
  if (typeof d.tariff_url === "string" || typeof d.pricing_url === "string") {
    const url = (d.tariff_url ?? d.pricing_url) as string;
    return (
      <div className="mt-1 text-[13px] text-muted">
        Tariff effective {String(d.effective_date ?? "—")} ·{" "}
        {d.reviewed_at ? `reviewed ${String(d.reviewed_at)}` : <span className="font-medium text-warn">seed value, not yet reviewed</span>} ·{" "}
        <a className="underline underline-offset-2 hover:text-text" href={url} target="_blank" rel="noreferrer">
          source
        </a>
      </div>
    );
  }
  return null;
}

export function RouteDetail({ r, sourceCurrency }: { r: RouteResult; sourceCurrency: string }) {
  return (
    <div className="flex flex-col gap-8 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={r.type === "usdc" ? "accent" : "neutral"}>{ROUTE_TYPE_LABEL[r.type]}{r.network ? ` · ${networkName(r)}` : ""}</Badge>
          <QualityBadge r={r} />
        </div>
        <dl className="mt-4 grid grid-cols-2 rounded-lg border border-border sm:grid-cols-4">
          <Stat label="Recipient gets" value={money(r.recipient_amount, r.recipient_currency)} lead />
          <Stat label="All-in cost" value={pct(r.all_in_cost_pct, 3)} sub={money(r.total_cost_source, sourceCurrency)} />
          <Stat label="Typical time" value={minutes(r.duration.typical)} sub={durationRange(r.duration)} />
          <Stat label="Effective rate" value={Number(r.effective_rate).toFixed(6)} sub={`${r.spread_bps ?? "—"} bps vs mid`} />
        </dl>
        {r.estimated_arrival && <p className="mt-3 text-[13px] text-muted">Typical arrival in the recipient&apos;s bank: <span className="text-text">{when(r.estimated_arrival)}</span></p>}
      </div>

      <section>
        <h3 className="mb-4 text-sm font-semibold">Timeline · sender funding → recipient bank</h3>
        <ol className="relative">
          {r.legs?.map((leg) => (
            <li key={leg.index} className="group/leg relative pb-6 pl-6 last:pb-0">
              <span aria-hidden className="absolute bottom-0 left-[4px] top-3 w-px bg-border group-last/leg:hidden" />
              <span aria-hidden className={`absolute left-0 top-[6px] h-[9px] w-[9px] rounded-full ${leg.kind === "network" ? "bg-accent" : "border-[1.5px] border-text bg-surface"}`} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{leg.label}</span>
                <Badge tone={statusTone(leg.source_status)}>{statusLabel(leg.source_status, leg.source_ids?.[0])}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted tabular">
                <span>
                  {money(leg.amount_in, leg.unit_in, { dp: leg.unit_in === "USDC" ? 6 : undefined })} →{" "}
                  <span className="text-text">{money(leg.amount_out, leg.unit_out, { dp: leg.unit_out === "USDC" ? 6 : undefined })}</span>
                </span>
                {Number(leg.fee) !== 0 && <span>fee {money(leg.fee, leg.fee_unit, { dp: leg.fee_unit === "USDC" ? 6 : undefined })}</span>}
                <span>{leg.duration.known ? `${minutes(leg.duration.typical)} (${durationRange(leg.duration)})` : "Duration unknown"}</span>
                {leg.observed_at && <span>observed {when(leg.observed_at)}</span>}
              </div>
              {leg.duration.note && <p className="mt-0.5 text-xs text-muted">{leg.duration.note}</p>}
              {(leg.assumptions?.length ?? 0) > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {leg.assumptions!.map((a) => (
                    <li key={a}>
                      <span className="font-medium text-warn">Assumption</span> {a}
                    </li>
                  ))}
                </ul>
              )}
              <Detail leg={leg} />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Every fee, in its native unit and ≈ {sourceCurrency}</h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="h-8 pr-3 text-left font-normal">Component</th>
              <th className="h-8 text-right font-normal">Charged</th>
              <th className="h-8 w-28 text-right font-normal">≈ {sourceCurrency}</th>
            </tr>
          </thead>
          <tbody>
            {r.fee_breakdown?.map((f, i) => (
              <tr key={i} className="border-b border-rule">
                <td className="py-2 pr-3">
                  {f.label}
                  {f.assumption && <Badge tone="warn">Assumption</Badge>}
                </td>
                <td className="py-2 text-right text-muted tabular">{f.amount} {f.unit}</td>
                <td className="py-2 text-right tabular">{f.amount_source != null ? Number(f.amount_source).toFixed(2) : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2.5">Total against the reference mid-rate</td>
              <td />
              <td className="py-2.5 text-right tabular">{Number(r.total_cost_source).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs leading-4 text-muted">
          The implied line is the residual between the all-in cost and explicit fees (book spread, price impact, or an assumed FX margin), so
          nothing is counted twice. USDC fees are shown at 1 USDC = 1 USD for the {sourceCurrency} equivalent only.
        </p>
      </section>

      {((r.prerequisites?.length ?? 0) > 0 || (r.risks?.length ?? 0) > 0) && (
        <section className="grid gap-6 sm:grid-cols-2">
          {(r.prerequisites?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Prerequisites</h3>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted">{r.prerequisites!.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {(r.risks?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Modelled risks</h3>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted">{r.risks!.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </section>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold hover:text-muted">Source IDs</summary>
        <p className="mt-2 break-all font-mono text-xs text-muted">{r.source_ids?.join(" · ")}</p>
      </details>
    </div>
  );
}

function Stat({ label, value, sub, lead }: { label: string; value: string; sub?: string; lead?: boolean }) {
  return (
    <div className="border-rule px-4 py-3 [&:nth-child(n+2)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={lead ? "mt-1 text-lg font-bold tabular" : "mt-1 text-base font-medium tabular"}>{value}</dd>
      {sub && <dd className="text-xs text-muted tabular">{sub}</dd>}
    </div>
  );
}
