"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { Fragment, type ReactNode } from "react";
import { FAMILY_LABEL, familyOf, received, type Names } from "@/lib/derive";
import { chainSym, dur, flag, money, num, venueSym, when } from "@/lib/format";
import { cn, FamilyMark, Glyph, Tag } from "../ui/kit";

const dpOf = (ccy: string) => (ccy === "JPY" ? 0 : 2);

/* ------------------------------------------------------------------ path chain */

interface Hop {
  glyph: ReactNode;
  title: string;
  sub: string;
  amount: string;
  unit: string;
}

function hopsOf(r: RouteResult, data: ComparisonResponse, n: Names): Hop[] {
  const req = data.request;
  const start: Hop = {
    glyph: <span aria-hidden className="text-base leading-none">{flag(req.source_country)}</span>,
    title: "Sender bank",
    sub: r.funding_method ? n.rail(r.funding_method) : "bank account",
    amount: req.send_amount,
    unit: req.source_currency,
  };
  const end: Hop = {
    glyph: <span aria-hidden className="text-base leading-none">{flag(req.destination_country)}</span>,
    title: "Recipient bank",
    sub: r.payout_method ? n.rail(r.payout_method) : "bank account",
    amount: r.recipient_amount ?? "",
    unit: r.recipient_currency,
  };
  if (r.type !== "usdc") {
    const mid = r.provider_steps.slice(1, -1).map<Hop>((p) => ({
      glyph: <Glyph kind="bank" text={p.slice(0, 2)} />,
      title: p,
      sub: r.legs.find((l) => l.kind === "conversion")?.label.split("(")[0].trim() ?? "",
      amount: "",
      unit: "",
    }));
    return [start, ...mid, end];
  }
  const buy = r.legs.find((l) => l.kind === "trade");
  const sell = [...r.legs].reverse().find((l) => l.kind === "trade");
  const net = r.legs.find((l) => l.kind === "network");
  return [
    start,
    { glyph: <Glyph kind="venue" text={venueSym(r.source_venue)} />, title: n.venue(r.source_venue), sub: "buy USDC", amount: buy?.amount_out ?? "", unit: "USDC" },
    { glyph: <Glyph kind="chain" text={chainSym(r.network)} />, title: n.net(r.network), sub: "native USDC transfer", amount: net?.amount_out ?? "", unit: "USDC" },
    { glyph: <Glyph kind="venue" text={venueSym(r.destination_venue)} />, title: n.venue(r.destination_venue), sub: `sell for ${r.recipient_currency}`, amount: sell?.amount_out ?? "", unit: r.recipient_currency },
    end,
  ];
}

export function PathChain({ r, data, names, dense }: { r: RouteResult; data: ComparisonResponse; names: Names; dense?: boolean }) {
  const hops = hopsOf(r, data, names);
  return (
    <ol aria-label="Route path" className="flex min-w-0 items-stretch overflow-x-auto scroll-thin pb-1">
      {hops.map((h, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <li aria-hidden className="flex min-w-6 flex-1 items-center px-1">
              <span className={cn("h-px flex-1", r.type === "usdc" && i > 1 && i < hops.length - 1 ? "bg-usdc" : "bg-line-2")} />
              <svg viewBox="0 0 6 8" className="h-2 w-1.5 text-line-2">
                <path d="M0 0l6 4-6 4z" fill="currentColor" />
              </svg>
            </li>
          )}
          <li className={cn("flex shrink-0 flex-col items-start", dense ? "gap-1" : "gap-1.5")}>
            <div className="flex items-center gap-2">
              <span className="flex h-6 min-w-6 items-center justify-center">{h.glyph}</span>
              <div className="min-w-0 leading-tight">
                <div className="text-[12.5px] font-medium whitespace-nowrap">{h.title}</div>
                {!dense && <div className="text-[11px] whitespace-nowrap text-faint">{h.sub}</div>}
              </div>
            </div>
            {h.amount && (
              <div className="num pl-8 text-[11.5px] whitespace-nowrap text-muted">
                {num(h.amount, h.unit === "USDC" ? 2 : dpOf(h.unit))} <span className="text-faint">{h.unit}</span>
              </div>
            )}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ verdict */

export function Verdict({ data, names, onOpen }: { data: ComparisonResponse; names: Names; onOpen: (id: string) => void }) {
  const rec = data.routes.find((r) => r.id === data.recommended_route_id);
  const ccy = data.request.destination_currency;
  const conv = data.routes.filter((r) => r.type !== "usdc" && r.eligible && r.recipient_amount != null).sort((a, b) => received(b)! - received(a)!)[0];
  if (!rec) {
    return (
      <section aria-labelledby="verdict" className="rounded-2xl border border-line bg-panel p-5">
        <h2 id="verdict" className="text-base font-semibold">No eligible route</h2>
        <p className="mt-1 text-[13px] text-muted">{data.recommendation_reason}</p>
      </section>
    );
  }
  const fam = familyOf(rec);
  const delta = conv && rec.id !== conv.id ? received(rec)! - received(conv)! : null;
  return (
    <section aria-labelledby="verdict" className="grid-bg relative overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--glow)] via-transparent to-transparent" />
      <div className="relative p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="verdict" className="eyebrow flex items-center gap-1.5 text-usdc-ink">
            <FamilyMark family={fam} /> Recommended · {FAMILY_LABEL[fam]}
          </h2>
          <Tag tone={data.recommendation_grade === "current" ? "up" : "warn"} title={data.recommendation_grade === "current" ? "Live prices, reviewed tariffs, no overrides" : "Some legs rely on assumptions or unreviewed tariffs"}>
            {data.recommendation_grade === "current" ? "Current grade" : "Research grade"}
          </Tag>
          {data.pareto_route_ids.includes(rec.id) && <Tag tone="usdc" title="No other route is both cheaper and faster">Frontier</Tag>}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="num text-[44px] leading-[48px] font-semibold tracking-tight">
              {num(rec.recipient_amount, dpOf(ccy))}
              <span className="ml-2 text-xl font-medium text-muted">{ccy}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              lands in the recipient&apos;s bank from <span className="num text-text">{money(data.request.send_amount, data.request.source_currency)}</span>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-7 gap-y-3 pb-1">
            {delta != null && (
              <div>
                <dt className="eyebrow">vs {conv!.type === "bank_wire" ? "bank wire" : "Wise"}</dt>
                <dd className={cn("num mt-0.5 text-[17px] font-medium", delta >= 0 ? "text-up" : "text-down")}>
                  {delta >= 0 ? "▲" : "▼"} {num(Math.abs(delta), dpOf(ccy))} <span className="text-xs">{ccy}</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="eyebrow">All-in cost</dt>
              <dd className="num mt-0.5 text-[17px] font-medium">{num(rec.all_in_cost_pct, 2)}%</dd>
            </div>
            <div>
              <dt className="eyebrow">End to end</dt>
              <dd className="num mt-0.5 text-[17px] font-medium" title={rec.estimated_arrival ? when(rec.estimated_arrival) : undefined}>
                {rec.duration.known ? dur(rec.duration.typical) : "Unknown"}
                <span className="ml-1.5 text-[11px] font-normal text-faint">
                  {dur(rec.duration.min)}–{dur(rec.duration.max)}
                </span>
              </dd>
            </div>
            {rec.timing_split?.conversion.known && (
              <div>
                <dt className="eyebrow">Conversion only</dt>
                <dd className="num mt-0.5 text-[17px] font-medium" title="Trade, exchange withdrawal, on-chain transfer and exchange credit, excluding fiat pay-in, holds and payout">
                  {dur(rec.timing_split.conversion.typical)}
                  <span className="ml-1.5 text-[11px] font-normal text-faint">
                    {dur(rec.timing_split.conversion.min)}–{dur(rec.timing_split.conversion.max)}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-panel/70 px-4 py-3 backdrop-blur-sm">
          <PathChain r={rec} data={data} names={names} />
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[78ch] text-[12.5px] leading-5 text-muted">{data.recommendation_reason}</p>
          <button type="button" onClick={() => onOpen(rec.id)} className="shrink-0 text-[12.5px] font-medium text-usdc-ink hover:underline">
            Trace this route →
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pick cards */

export function Picks({ data, onOpen }: { data: ComparisonResponse; onOpen: (id: string) => void }) {
  const byId = (id: string | null | undefined) => (id ? data.routes.find((r) => r.id === id) : undefined);
  const best = byId(data.most_received_route_id);
  const ccy = data.request.destination_currency;
  const picks: { tag: string; r: RouteResult | undefined; why: string }[] = [
    { tag: "Most received", r: best, why: "highest recipient amount" },
    { tag: "Fastest", r: byId(data.fastest_route_id), why: "shortest known typical time" },
    { tag: "Wise", r: data.routes.find((r) => r.type === "conventional_provider"), why: "conventional provider" },
    { tag: "Bank wire", r: data.routes.find((r) => r.type === "bank_wire"), why: "retail SWIFT" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {picks.map(({ tag, r, why }) => {
        if (!r || r.recipient_amount == null) return null;
        const fam = familyOf(r);
        const d = best && r.id !== best.id ? received(r)! - received(best)! : null;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onOpen(r.id)}
            className="group min-w-0 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-line-2 hover:bg-panel-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow flex items-center gap-1.5">
                <FamilyMark family={fam} size={8} />
                {tag}
              </span>
              <span className="num text-[11px] text-faint">{dur(r.duration.typical)}</span>
            </div>
            <div className="num mt-2 text-lg leading-6 font-medium">
              {num(r.recipient_amount, dpOf(ccy))} <span className="text-xs text-faint">{ccy}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate text-muted" title={r.label}>
                {r.type === "usdc" ? r.provider_steps.join(" → ") : why}
              </span>
              {d != null && d !== 0 ? (
                <span className={cn("num shrink-0", d > 0 ? "text-up" : "text-down")}>
                  {d > 0 ? "+" : "−"}
                  {num(Math.abs(d), dpOf(ccy))}
                </span>
              ) : (
                <span className="num shrink-0 text-faint">{d === 0 ? "tie" : "best"}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
