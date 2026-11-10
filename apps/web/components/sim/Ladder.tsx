"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { Fragment, useMemo, useState } from "react";
import { familyOf, lanesOf, received, timeOf, type Lane, type Names, type TimeBasis } from "@/lib/derive";
import { chainSym, dur, EXCLUSION_LABEL, num, venueSym } from "@/lib/format";
import { Chip, cn, FamilyMark, Glyph, Panel, PanelHead, Seg, Tag } from "../ui/kit";

export type FamilyFilter = "all" | "usdc" | "conv";
type Sort = "rank" | "received" | "time";

export function matchesFocus(r: RouteResult, focus: string | null) {
  if (!focus) return true;
  const [col, key] = focus.split(":");
  if (col === "0") return r.source_venue === key;
  if (col === "1") return r.network === key;
  return r.destination_venue === key;
}

/** Shared log time scale for the duration whiskers in the Time column. */
function useTimeScale(routes: RouteResult[], basis: TimeBasis) {
  return useMemo(() => {
    const ms = routes.flatMap((r) => [timeOf(r, basis).min, timeOf(r, basis).max]).filter((m): m is number => m != null && m > 0);
    const lo = Math.log10(Math.max(1, Math.min(...ms, 10)));
    const hi = Math.log10(Math.max(...ms, 60));
    return (m: number) => (Math.log10(Math.max(1, m)) - lo) / (hi - lo || 1);
  }, [routes, basis]);
}

function TimeCell({ r, scale, basis }: { r: RouteResult; scale: (m: number) => number; basis: TimeBasis }) {
  const d = timeOf(r, basis);
  const other = basis === "CONVERSION" ? r.duration : r.timing_split?.conversion;
  if (!d.known || d.typical == null) return <span className="text-faint">Unknown</span>;
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span
        aria-hidden
        className="relative hidden h-3 w-20 sm:block"
        title={`min ${dur(d.min)} · typical ${dur(d.typical)} · max ${dur(d.max)}`}
      >
        <span className="absolute top-1/2 h-px w-full bg-line" />
        {d.min != null && d.max != null && (
          <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line-2" style={{ left: `${scale(d.min) * 100}%`, width: `${Math.max(2, (scale(d.max) - scale(d.min)) * 100)}%` }} />
        )}
        <span className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded bg-text" style={{ left: `${scale(d.typical) * 100}%` }} />
      </span>
      <span className="num w-16 text-right leading-tight">
        {dur(d.typical)}
        {other?.known && other.typical != null && (
          <span className="block text-[10.5px] text-faint" title={basis === "CONVERSION" ? "End to end" : "Conversion only: trade, withdraw, on-chain, credit"}>
            {basis === "CONVERSION" ? "e2e" : "conv"} {dur(other.typical)}
          </span>
        )}
      </span>
    </div>
  );
}

function CostCell({ pct, cap }: { pct: string | null | undefined; cap: number }) {
  if (pct == null) return <span className="text-faint">—</span>;
  const v = Number(pct);
  const over = v > cap;
  return (
    <div className="flex items-center justify-end gap-2">
      <span aria-hidden className="relative hidden h-1.5 w-14 overflow-hidden rounded-full bg-hover sm:block">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", v < 0 ? "bg-up" : "bg-faint/70")} style={{ width: `${Math.min(1, Math.abs(v) / cap) * 100}%` }} />
      </span>
      <span className="num w-14 text-right">
        {num(v, 2)}%{over && <span className="text-faint">»</span>}
      </span>
    </div>
  );
}

function LanePath({ lane, names }: { lane: Lane; names: Names }) {
  const r = lane.best;
  if (r.type !== "usdc") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <FamilyMark family={lane.family} />
        <span className="truncate font-medium">{r.label}</span>
      </span>
    );
  }
  const chains = lane.variants.map((v) => v.network!).filter(Boolean);
  return (
    <span className="flex min-w-0 flex-col gap-0.5" title={r.label}>
      <span className="flex min-w-0 items-center gap-1.5">
        <FamilyMark family="usdc" />
        <Glyph kind="venue" size="sm" text={venueSym(r.source_venue)} />
        <span className="truncate font-medium">{names.venue(r.source_venue)}</span>
        <span aria-hidden className="text-faint">→</span>
        <Glyph kind="venue" size="sm" text={venueSym(r.destination_venue)} />
        <span className="truncate font-medium">{names.venue(r.destination_venue)}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 pl-[18px] text-[11px] text-faint">
        <span className="truncate">{names.rail(r.funding_method)}</span>
        <span aria-hidden>·</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {chains.slice(0, 5).map((c) => (
            <span key={c} title={names.net(c)} className="num rounded bg-usdc-soft px-1 text-[9.5px] leading-[14px] text-usdc-ink">
              {chainSym(c)}
            </span>
          ))}
          {chains.length > 5 && <span className="num pl-0.5 text-[10px]">+{chains.length - 5}</span>}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate">{names.rail(r.payout_method)}</span>
      </span>
    </span>
  );
}

export function Ladder({
  data,
  names,
  family,
  setFamily,
  focus,
  onOpen,
}: {
  data: ComparisonResponse;
  names: Names;
  family: FamilyFilter;
  setFamily: (f: FamilyFilter) => void;
  focus: string | null;
  onOpen: (id: string) => void;
}) {
  const [chains, setChains] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("rank");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const ccy = data.request.destination_currency;
  const dp = ccy === "JPY" ? 0 : 2;

  const eligible = data.routes.filter((r) => r.eligible);
  const best = Math.max(...eligible.map((r) => received(r) ?? -Infinity));
  const allChains = [...new Set(eligible.map((r) => r.network).filter((n): n is string => !!n))];
  const basis: TimeBasis = data.request.time_basis ?? "END_TO_END";
  const timeScale = useTimeScale(eligible, basis);
  const costCap = Math.max(0.5, ...eligible.filter((r) => r.type !== "bank_wire").map((r) => Number(r.all_in_cost_pct ?? 0)));

  const filtered = eligible.filter(
    (r) =>
      (family === "all" || (family === "usdc" ? r.type === "usdc" : r.type !== "usdc")) &&
      (r.type !== "usdc" || chains.size === 0 || chains.has(r.network!)) &&
      (r.type !== "usdc" ? !focus : matchesFocus(r, focus)),
  );
  let lanes = lanesOf(filtered);
  if (sort === "received") lanes = [...lanes].sort((a, b) => (received(b.best) ?? 0) - (received(a.best) ?? 0));
  if (sort === "time") lanes = [...lanes].sort((a, b) => (timeOf(a.best, basis).typical ?? 1e12) - (timeOf(b.best, basis).typical ?? 1e12));
  const shown = showAll ? lanes : lanes.slice(0, 12);

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const row = (r: RouteResult, opts: { lane?: Lane; rank?: number; sub?: boolean }) => {
    const v = received(r);
    const delta = v == null ? null : v - best;
    const multi = opts.lane && opts.lane.variants.length > 1;
    const expanded = opts.lane && open.has(opts.lane.key);
    return (
      <tr
        key={(opts.sub ? "s" : "l") + r.id}
        onClick={() => (multi && !opts.sub ? toggle(opts.lane!.key) : onOpen(r.id))}
        className={cn("group cursor-pointer border-t border-line transition hover:bg-hover", opts.sub && "bg-panel-2/60")}
      >
        <td className="num w-10 py-2 pl-4 text-[11px] text-faint">{opts.rank ?? ""}</td>
        <td className="max-w-0 py-2 pr-3">
          {opts.sub ? (
            <span className="flex items-center gap-2 pl-5 text-[12.5px]">
              <Glyph kind="chain" size="sm" text={chainSym(r.network).slice(0, 4)} />
              <span title={r.label}>USDC on {names.net(r.network)}</span>
              {data.pareto_route_ids.includes(r.id) && <Tag tone="usdc">Frontier</Tag>}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[12.5px]">
              {multi ? (
                <svg aria-hidden viewBox="0 0 12 12" className={cn("h-3 w-3 shrink-0 text-faint transition", expanded && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4.5 3l3 3-3 3" />
                </svg>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <LanePath lane={opts.lane!} names={names} />
              {opts.lane!.variants.some((x) => data.pareto_route_ids.includes(x.id)) && <Tag tone="usdc">Frontier</Tag>}
              {r.input_quality === "assumed" && <Tag tone="warn" title="Priced from assumed tariffs">Assumed</Tag>}
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-right">
          <span className="num text-[13px] font-medium">{num(r.recipient_amount, dp)}</span>
        </td>
        <td className={cn("num py-2 pr-3 text-right text-[12px]", delta == null ? "text-faint" : delta === 0 ? "text-up" : "text-down")}>
          {delta == null ? "—" : delta === 0 ? "best" : `−${num(Math.abs(delta), dp)}`}
        </td>
        <td className="py-2 pr-3 text-[12px]">
          <CostCell pct={r.all_in_cost_pct} cap={costCap} />
        </td>
        <td className="py-2 pr-4 text-[12px]">
          <TimeCell r={r} scale={timeScale} basis={basis} />
        </td>
      </tr>
    );
  };

  return (
    <Panel aria-labelledby="ladder-h">
      <PanelHead
        id="ladder-h"
        title="Route ladder"
        sub={`${filtered.length} of ${eligible.length} priced routes, grouped into ${lanes.length} lanes (same venues and rails, different chain). Expand a lane to compare chains; click a route to trace it.`}
      />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Seg
          label="Route family"
          size="sm"
          value={family}
          onChange={setFamily}
          options={[
            { value: "all", label: "All" },
            { value: "usdc", label: "USDC" },
            { value: "conv", label: "Conventional" },
          ]}
        />
        <Seg
          label="Sort lanes by"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: "rank", label: "Objective" },
            { value: "received", label: "Received" },
            { value: "time", label: "Time" },
          ]}
        />
        {family !== "conv" && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by chain">
            {allChains.map((c) => (
              <Chip
                key={c}
                active={chains.has(c)}
                title={names.net(c)}
                onClick={() =>
                  setChains((s) => {
                    const n = new Set(s);
                    if (n.has(c)) n.delete(c);
                    else n.add(c);
                    return n;
                  })
                }
                className="h-6 px-1.5 font-mono text-[10.5px]"
              >
                {chainSym(c)}
              </Chip>
            ))}
            {chains.size > 0 && (
              <button type="button" className="px-1 text-[11px] text-muted hover:text-text" onClick={() => setChains(new Set())}>
                clear
              </button>
            )}
          </div>
        )}
        {focus && <Tag tone="usdc">map: {focus.split(":")[1]}</Tag>}
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[820px] table-fixed text-left">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[120px]" />
            <col className="w-[92px]" />
            <col className="w-[132px]" />
            <col className="w-[160px]" />
          </colgroup>
          <thead>
            <tr className="eyebrow">
              <th className="pb-2 pl-4 font-normal">#</th>
              <th className="pb-2 font-normal">Route</th>
              <th className="pr-3 pb-2 text-right font-normal">Received {ccy}</th>
              <th className="pr-3 pb-2 text-right font-normal">Δ best</th>
              <th className="pr-3 pb-2 text-right font-normal">All-in cost</th>
              <th className="pr-4 pb-2 text-right font-normal">{basis === "CONVERSION" ? "Conversion · range" : "End to end · range"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((lane, i) => (
              <Fragment key={lane.key}>
                {row(lane.best, { lane, rank: i + 1 })}
                {open.has(lane.key) && lane.variants.map((v) => row(v, { sub: true }))}
              </Fragment>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted">
                  No route matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {lanes.length > 12 && (
        <div className="border-t border-line px-4 py-2">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-muted hover:text-text">
            {showAll ? "Show top 12 lanes" : `Show all ${lanes.length} lanes`}
          </button>
        </div>
      )}
    </Panel>
  );
}

export function Excluded({ data, names }: { data: ComparisonResponse; names: Names }) {
  const list = [...data.excluded, ...data.routes.filter((r) => !r.eligible)];
  if (!list.length) return null;
  const byCode = new Map<string, RouteResult[]>();
  for (const r of list) for (const c of r.exclusion_codes.length ? r.exclusion_codes : ["OTHER"]) byCode.set(c, [...(byCode.get(c) ?? []), r]);
  return (
    <details className="group rounded-xl border border-line bg-panel">
      <summary className="flex items-center gap-2 px-4 py-3 text-[13px]">
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-faint transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="font-semibold">Excluded</span>
        <span className="num text-muted">{list.length}</span>
        <span className="ml-1 flex flex-wrap gap-1">
          {[...byCode].map(([c, rs]) => (
            <Tag key={c}>
              {EXCLUSION_LABEL[c] ?? c} · {rs.length}
            </Tag>
          ))}
        </span>
      </summary>
      <ul className="border-t border-line">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line px-4 py-2 text-[12.5px] last:border-0">
            <span className="flex items-center gap-1.5 font-medium">
              <FamilyMark family={familyOf(r)} size={8} />
              {r.label || names.venue(r.source_venue)}
            </span>
            <span className="text-muted">{r.exclusion_reasons.join(" ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
