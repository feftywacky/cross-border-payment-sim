"use client";

import type { ComparisonResponse, FeeItem, LegResult, RouteResult } from "@sim/contracts";
import { useState } from "react";
import { FAMILY_LABEL, familyOf, LEG_ICON, phaseSplit, type Names } from "@/lib/derive";
import { dur, money, num, statusLabel, when } from "@/lib/format";
import { cn, FamilyMark, Stat, Tag } from "../ui/kit";
import { PathChain } from "./Verdict";

const statusTone = (s: LegResult["source_status"]) =>
  s === "live_api" ? "up" : s === "published_tariff" || s === "provider_estimate" ? "usdc" : s === "user_assumption" ? "warn" : "neutral";

/* ------------------------------------------------------------------ fee bars */

const FEE_LABEL: Record<FeeItem["category"], string> = {
  funding: "Funding", trading: "Trading", conversion: "Conversion", withdrawal: "Withdrawal", network: "Network", deposit: "Deposit",
  payout: "Payout", provider: "Provider", intermediary: "Intermediary", receiving: "Receiving", fx_spread: "FX spread",
  implied_spread_impact: "Spread & impact",
};

function FeeBars({ r, src }: { r: RouteResult; src: string }) {
  const items = r.fee_breakdown.filter((f) => f.amount_source != null);
  const total = Number(r.total_cost_source ?? 0);
  const max = Math.max(...items.map((f) => Math.abs(Number(f.amount_source))), 1e-9);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow">Where the cost goes · in {src} at reference</h3>
        <span className="num text-[12.5px]">
          {money(String(total), src)} <span className="text-faint">· {num(r.all_in_cost_pct, 2)}%</span>
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((f, i) => {
          const v = Number(f.amount_source);
          return (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_120px_92px] items-center gap-3 text-[12px]">
              <span className="min-w-0 truncate" title={f.label}>
                <span className="text-muted">{FEE_LABEL[f.category]}</span> <span className="text-faint">· {f.label}</span>
              </span>
              <span aria-hidden className="relative h-2 rounded-full bg-hover">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", f.assumption ? "hatch bg-warn/40" : v < 0 ? "bg-up" : "bg-faint/70")}
                  style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }}
                />
              </span>
              <span className="num text-right">
                {num(v, 2)}
                {f.unit !== src && <span className="block text-[10.5px] text-faint">{money(f.amount, f.unit)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-faint">Hatched bars are assumptions. “Spread & impact” is the residual against the ECB reference after explicit fees, so nothing is counted twice.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ time split */

function TimeBar({ r }: { r: RouteResult }) {
  const split = phaseSplit(r);
  if (!split || !r.duration.known) return <p className="text-[12.5px] text-muted">Completion time unknown: at least one material leg has no known duration.</p>;
  const { total, rails, conversion } = split;
  const c = total ? Math.min(1, (conversion.typical ?? 0) / total) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow">End to end</h3>
        <span className="num text-[12.5px]">
          {dur(total)} <span className="text-faint">typical · {dur(r.duration.min)}–{dur(r.duration.max)}</span>
        </span>
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-hover" aria-hidden>
        <span className="hatch h-full flex-1" />
        <span className="h-full bg-usdc" style={{ width: `${Math.max(1.5, c * 100)}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="hatch inline-block h-2 w-2 rounded-sm border border-line-2" aria-hidden /> Bank rails: pay-in, holds, payout{" "}
          <span className="num text-text">{dur(rails.typical)}</span>
          <span className="text-faint">{dur(rails.min)}–{dur(rails.max)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-usdc" aria-hidden /> Conversion: trade, withdraw, on-chain, credit{" "}
          <span className="num text-text">{dur(conversion.typical)}</span>
          <span className="text-faint">{dur(conversion.min)}–{dur(conversion.max)}</span>
        </span>
      </div>
      {r.estimated_arrival && <p className="mt-1 text-[11.5px] text-faint">Estimated arrival {when(r.estimated_arrival)} (calendar-aware from the chosen start). Bank rails include waiting for business hours and weekends.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ leg details */

type Level = { price: string; qty: string };

function BookLadder({ d }: { d: Record<string, unknown> }) {
  const levels = (d.levels as Level[] | undefined) ?? [];
  const max = Math.max(...levels.map((l) => Number(l.qty)), 1e-9);
  const buy = String(d.side ?? "").startsWith("buy");
  return (
    <div className="rounded-lg border border-line">
      <div className="grid grid-cols-4 gap-2 border-b border-line px-3 py-2 text-[11px]">
        <Stat label="Best" value={String(d.best_price ?? "—")} />
        <Stat label="VWAP" value={Number(d.vwap ?? 0).toPrecision(7)} />
        <Stat label="Mid" value={Number(d.mid ?? 0).toPrecision(7)} />
        <Stat label="Impact" value={`${d.impact_bps ?? "0"} bp`} />
      </div>
      <div className="px-3 py-2">
        <div className="eyebrow mb-1 flex justify-between">
          <span>
            {String(d.side)} · {String(d.symbol)}
          </span>
          <span>{levels.length} level(s) used</span>
        </div>
        <ul className="space-y-px">
          {levels.slice(0, 12).map((l, i) => (
            <li key={i} className="relative grid grid-cols-2 px-1.5 py-0.5 text-[11.5px]">
              <span
                aria-hidden
                className={cn("absolute inset-y-0 right-0 rounded-sm", buy ? "bg-down-soft" : "bg-up-soft")}
                style={{ width: `${(Number(l.qty) / max) * 100}%` }}
              />
              <span className={cn("num relative", buy ? "text-down" : "text-up")}>{l.price}</span>
              <span className="num relative text-right">{Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10.5px] text-faint">
          {String(d.book_orientation ?? "")} · taker fee {String(d.taker_fee_pct ?? "")}% · observed {when(String(d.observed_at ?? ""))}
        </p>
      </div>
    </div>
  );
}

function NetworkDetail({ d }: { d: Record<string, unknown> }) {
  const contract = typeof d.usdc_contract === "string" ? d.usdc_contract : null;
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line px-3 py-2.5 text-[11.5px] sm:grid-cols-4">
      <Stat label="Self-custody gas" value={d.self_custody_gas_usd != null ? `$${Number(d.self_custody_gas_usd).toPrecision(3)}` : "—"} />
      <Stat label="Gas token" value={`${d.gas_token ?? "—"} $${Number(d.gas_token_usd ?? 0).toLocaleString()}`} />
      {d.base_fee_gwei != null && <Stat label="Base / tip" value={`${Number(d.base_fee_gwei).toPrecision(3)} / ${Number(d.priority_fee_gwei ?? 0).toPrecision(2)} gwei`} />}
      {d.fee_native != null && <Stat label="Fee (native)" value={Number(d.fee_native).toPrecision(3)} />}
      {contract && (
        <div className="col-span-2 sm:col-span-4">
          <div className="eyebrow">USDC contract</div>
          <button
            type="button"
            className="num mt-1 inline-flex max-w-full items-center gap-2 truncate rounded bg-hover px-1.5 py-0.5 text-[11px] hover:text-text"
            onClick={() => navigator.clipboard?.writeText(contract).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
            title="Copy address"
          >
            {contract.length > 24 ? `${contract.slice(0, 10)}…${contract.slice(-8)}` : contract}
            <span className="text-faint">{copied ? "copied" : "copy"}</span>
          </button>
        </div>
      )}
      {typeof d.note === "string" && <p className="col-span-2 text-[11px] text-faint sm:col-span-4">{d.note}</p>}
    </div>
  );
}

function LegRow({ l, last }: { l: LegResult; last: boolean }) {
  const d = l.detail as Record<string, unknown>;
  const hasBook = l.kind === "trade" && Array.isArray(d.levels);
  const hasNet = l.kind === "network";
  const feeZero = Number(l.fee) === 0;
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      {/* rail line */}
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[13.5px] w-px bg-line-2" />}
      <span className={cn("relative z-[1] mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border bg-panel", l.kind === "network" ? "border-usdc text-usdc" : "border-line-2 text-muted")}>
        <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={LEG_ICON[l.kind] ?? "M5 10h10"} />
        </svg>
      </span>
      <div className="min-w-0 pb-5">
        <details className="group">
          <summary className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <span className="min-w-0">
              <span className="eyebrow">{l.kind}</span>
              <span className="mt-0.5 block text-[13px] font-medium">{l.label}</span>
            </span>
            <span className="flex items-center gap-2">
              <Tag tone={statusTone(l.source_status)}>{statusLabel(l.source_status, l.source_ids[0])}</Tag>
              <span className="num w-12 text-right text-[12px] text-muted">{l.duration.known ? dur(l.duration.typical) : "?"}</span>
            </span>
          </summary>
          <div className="num mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span className="text-text">{money(l.amount_in, l.unit_in)}</span>
            <span aria-hidden>→</span>
            <span className="text-text">{money(l.amount_out, l.unit_out)}</span>
            {!feeZero && <span className="text-down">fee {money(l.fee, l.fee_unit)}</span>}
            <span className="text-faint">
              {dur(l.duration.min)}–{dur(l.duration.max)}
              {l.schedule ? ` · ${l.schedule}` : ""}
            </span>
            <span className="ml-auto text-[11px] text-faint group-open:hidden">details ▾</span>
          </div>
          <div className="mt-2.5 space-y-2.5">
            {hasBook && <BookLadder d={d} />}
            {hasNet && <NetworkDetail d={d} />}
            {l.duration.note && <p className="text-[11.5px] text-muted">⏱ {l.duration.note}</p>}
            {!!l.assumptions.length && (
              <ul className="space-y-1 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[11.5px] text-warn">
                {l.assumptions.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
            {!!l.source_ids.length && (
              <p className="num text-[10.5px] break-all text-faint">
                sources: {l.source_ids.join(" · ")}
                {typeof d.tariff_url === "string" && (
                  <>
                    {" · "}
                    <a href={d.tariff_url} target="_blank" rel="noreferrer" className="underline hover:text-text">
                      tariff
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ trace */

export function RouteTrace({ r, data, names }: { r: RouteResult; data: ComparisonResponse; names: Names }) {
  const src = data.request.source_currency;
  const fam = familyOf(r);
  const best = data.routes.find((x) => x.id === data.most_received_route_id);
  const delta = best && r.recipient_amount != null && best.recipient_amount != null ? Number(r.recipient_amount) - Number(best.recipient_amount) : null;
  const dp = r.recipient_currency === "JPY" ? 0 : 2;
  return (
    <div className="space-y-6 px-5 py-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow flex items-center gap-1.5">
            <FamilyMark family={fam} size={9} /> {FAMILY_LABEL[fam]} route
          </span>
          {r.id === data.recommended_route_id && <Tag tone="usdc">Recommended</Tag>}
          {data.pareto_route_ids.includes(r.id) && <Tag tone="usdc">Frontier</Tag>}
          <Tag tone={r.input_quality === "live" ? "up" : r.input_quality === "mixed" ? "usdc" : "warn"}>{r.input_quality} inputs</Tag>
        </div>
        <h2 className="mt-2 text-[15px] leading-6 font-semibold">{r.label}</h2>
        <div className="mt-4 rounded-xl border border-line bg-panel-2 px-4 py-3">
          <PathChain r={r} data={data} names={names} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Received" value={money(r.recipient_amount, r.recipient_currency)} sub={delta ? `${num(delta, dp, true)} vs best` : "best"} />
          <Stat label="All-in cost" value={`${num(r.all_in_cost_pct, 2)}%`} sub={money(r.total_cost_source, src)} />
          <Stat label="Effective rate" value={Number(r.effective_rate ?? 0).toFixed(5)} sub={`${r.recipient_currency} per ${src}`} />
          <Stat label="Spread vs ref" value={`${num(r.spread_bps, 1)} bp`} sub="gross, before fees" />
        </dl>
      </header>

      <section className="rounded-xl border border-line p-4">
        <TimeBar r={r} />
      </section>

      <section className="rounded-xl border border-line p-4">
        <FeeBars r={r} src={src} />
      </section>

      <section aria-labelledby="trace-h">
        <h3 id="trace-h" className="eyebrow mb-3">
          Trace · sender funding → recipient bank · {r.legs.length} legs
        </h3>
        <ol>
          {r.legs.map((l, i) => (
            <LegRow key={l.index} l={l} last={i === r.legs.length - 1} />
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {!!r.prerequisites.length && (
          <div className="rounded-xl border border-line p-4">
            <h3 className="eyebrow">Prerequisites</h3>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-[18px] text-muted">
              {r.prerequisites.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-faint">○</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!r.risks.length && (
          <div className="rounded-xl border border-line p-4">
            <h3 className="eyebrow">Risks</h3>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-[18px] text-muted">
              {r.risks.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-warn">△</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <p className="num text-[10.5px] text-faint">route id {r.id}</p>
    </div>
  );
}
