"use client";

import type { LegResult, RouteResult } from "@sim/contracts";
import { durationRange, minutes, money, pct, ROUTE_TYPE_LABEL, statusLabel, when } from "@/lib/format";
import { QualityBadge, routeTone } from "./Results";
import { Badge } from "./ui";

const KIND_ICON: Record<string, string> = {
  funding: "⇥",
  trade: "⇄",
  conversion: "⇄",
  hold: "⏸",
  withdrawal: "↗",
  network: "⛓",
  deposit: "↘",
  payout: "⇤",
};

function statusTone(s: LegResult["source_status"]) {
  return s === "live_api" || s === "provider_estimate" ? "ok" : s === "published_tariff" ? "neutral" : "warn";
}

function Detail({ leg }: { leg: LegResult }) {
  const d = (leg.detail ?? {}) as Record<string, unknown>;
  if (leg.kind === "trade") {
    const levels = (d.levels as { price: string; qty: string }[] | undefined) ?? [];
    return (
      <div className="mt-2 rounded-xl bg-surface-2/60 p-3 text-xs">
        <p className="tabular text-muted">
          <span className="text-text">{String(d.symbol)}</span> · {String(d.side)} · VWAP {String(d.vwap)} · impact {String(d.impact_bps)} bps
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-faint hover:text-text">Fill details</summary>
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
          <details className="mt-2">
            <summary className="cursor-pointer text-faint hover:text-text">Depth consumed ({levels.length} level{levels.length > 1 ? "s" : ""} shown)</summary>
            <table className="mt-1 w-full tabular">
              <thead>
                <tr className="text-left text-muted">
                  <th className="font-medium">Price</th>
                  <th className="font-medium">Quantity taken (base)</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={i}>
                    <td>{l.price}</td>
                    <td>{Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
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
      <div className="mt-2 rounded-xl bg-surface-2/60 p-3 text-xs">
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
        <p className="mt-1 break-all text-muted">USDC contract: {String(d.usdc_contract ?? "—")}</p>
      </div>
    );
  }
  if (typeof d.tariff_url === "string" || typeof d.pricing_url === "string") {
    const url = (d.tariff_url ?? d.pricing_url) as string;
    return (
      <div className="mt-1 text-xs text-muted">
        Tariff effective {String(d.effective_date ?? "—")} ·{" "}
        {d.reviewed_at ? `reviewed ${String(d.reviewed_at)}` : <span className="text-warn">seed value, not yet reviewed</span>} ·{" "}
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
          <Badge tone={routeTone(r)}>{ROUTE_TYPE_LABEL[r.type]}{r.network ? ` · ${r.network}` : ""}</Badge>
          <QualityBadge r={r} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Recipient gets" value={money(r.recipient_amount, r.recipient_currency)} big />
          <Stat label="All-in cost" value={pct(r.all_in_cost_pct, 3)} sub={money(r.total_cost_source, sourceCurrency)} />
          <Stat label="Typical time" value={minutes(r.duration.typical)} sub={durationRange(r.duration)} />
          <Stat label="Effective rate" value={Number(r.effective_rate).toFixed(6)} sub={`${r.spread_bps ?? "—"} bps vs mid`} />
        </div>
        {r.estimated_arrival && <p className="mt-4 text-xs text-muted">Typical arrival in recipient bank: {when(r.estimated_arrival)}</p>}
      </div>

      <section>
        <h3 className="eyebrow mb-4">Timeline · sender funding → recipient bank</h3>
        <ol className="relative ml-3 border-l border-border pl-6">
          {r.legs?.map((leg) => (
            <li key={leg.index} className="relative mb-6 last:mb-0">
              <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[11px] text-muted ring-4 ring-surface" aria-hidden>
                {KIND_ICON[leg.kind] ?? "•"}
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{leg.label}</span>
                <Badge tone={statusTone(leg.source_status)}>{statusLabel(leg.source_status, leg.source_ids?.[0])}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted tabular">
                <span>
                  {money(leg.amount_in, leg.unit_in, { dp: leg.unit_in === "USDC" ? 6 : undefined })} →{" "}
                  <span className="text-text">{money(leg.amount_out, leg.unit_out, { dp: leg.unit_out === "USDC" ? 6 : undefined })}</span>
                </span>
                {Number(leg.fee) !== 0 && <span>fee {money(leg.fee, leg.fee_unit, { dp: leg.fee_unit === "USDC" ? 6 : undefined })}</span>}
                <span>{leg.duration.known ? `${minutes(leg.duration.typical)} (${durationRange(leg.duration)})` : "duration unknown"}</span>
                {leg.observed_at && <span className="text-faint">observed {when(leg.observed_at)}</span>}
              </div>
              {leg.duration.note && <p className="mt-0.5 text-[11px] text-faint">{leg.duration.note}</p>}
              {(leg.assumptions?.length ?? 0) > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-warn">
                  {leg.assumptions!.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              <Detail leg={leg} />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="eyebrow mb-3">Every fee · native unit and ≈ {sourceCurrency}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {r.fee_breakdown?.map((f, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2.5 pr-3">
                    {f.label}
                    {f.assumption && <span className="ml-2 text-warn">assumption</span>}
                  </td>
                  <td className="py-2.5 text-right text-muted tabular">{f.amount} {f.unit}</td>
                  <td className="w-24 py-2.5 text-right tabular">{f.amount_source != null ? Number(f.amount_source).toFixed(2) : "—"}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2.5">Total vs reference mid-rate</td>
                <td />
                <td className="py-2.5 text-right tabular">{Number(r.total_cost_source).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          The implied line is the residual between the all-in cost and explicit fees (book spread, price impact, or an assumed FX margin), so
          nothing is counted twice. USDC fees are shown at 1 USDC = 1 USD for the {sourceCurrency} equivalent only.
        </p>
      </section>

      {((r.prerequisites?.length ?? 0) > 0 || (r.risks?.length ?? 0) > 0) && (
        <section className="grid gap-6 sm:grid-cols-2">
          {(r.prerequisites?.length ?? 0) > 0 && (
            <div>
              <h3 className="eyebrow mb-2">Prerequisites</h3>
              <ul className="space-y-1 text-xs text-muted">{r.prerequisites!.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {(r.risks?.length ?? 0) > 0 && (
            <div>
              <h3 className="eyebrow mb-2">Modelled risks</h3>
              <ul className="space-y-1 text-xs text-muted">{r.risks!.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </section>
      )}
      <details>
        <summary className="eyebrow cursor-pointer hover:text-text">Sources</summary>
        <p className="mt-2 break-all font-mono text-[11px] text-faint">{r.source_ids?.join(" · ")}</p>
      </details>
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-faint">{label}</div>
      <div className={big ? "mt-0.5 text-lg font-medium tabular" : "mt-0.5 font-medium tabular"}>{value}</div>
      {sub && <div className="text-[11px] text-muted tabular">{sub}</div>}
    </div>
  );
}
