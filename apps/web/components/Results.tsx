"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { ago, durationRange, EXCLUSION_LABEL, minutes, money, pct, ROUTE_TYPE_LABEL, when } from "@/lib/format";
import { Badge, Card, Chevron, cn, Disclosure, Dot, inputBase, RoutePath, Segmented } from "./ui";

export function routeTone(r: Pick<RouteResult, "type">) {
  return r.type === "usdc" ? "accent" : "conv";
}

export function QualityBadge({ r }: { r: RouteResult }) {
  if (r.recommendation_grade === "current") return <Badge tone="ok">Current</Badge>;
  const t = { live: "Live prices", mixed: "Mixed inputs", assumed: "Assumed" }[r.input_quality ?? "assumed"];
  return (
    <Badge tone="neutral" title="Research scenario: some legs are assumptions or unreviewed tariffs">
      {t} · research scenario
    </Badge>
  );
}

const DP: Record<string, number> = { JPY: 0 };
/** Round to the currency's display precision, so differences are taken from the figures as shown. */
const shown = (amount: string | null | undefined, unit: string) => {
  const dp = DP[unit] ?? 2;
  return Math.round(Number(amount) * 10 ** dp) / 10 ** dp;
};

/** "Wise transfer (bank → bank)" → "Wise transfer". */
export const shortName = (r: RouteResult) =>
  r.type === "usdc" ? (r.label.match(/USDC on [^→(]+/)?.[0].trim() ?? "USDC route") : r.label.split(" (")[0];

/** Display name of a USDC route's network ("Solana", "OP Mainnet"), taken from its label rather than the id. */
export const networkName = (r: RouteResult) => r.label.match(/USDC on ([^→(]+)/)?.[1].trim() ?? r.network;

function bestOf(data: ComparisonResponse, usdc: boolean) {
  return data.routes.filter((r) => (r.type === "usdc") === usdc).sort((a, b) => Number(b.recipient_amount) - Number(a.recipient_amount))[0];
}

/** "1,551.77 EUR" → figure in ink + unit as a smaller grey suffix. */
function Amount({ amount, unit, className }: { amount: string | null | undefined; unit: string; className?: string }) {
  const s = money(amount, unit);
  const i = s.lastIndexOf(" ");
  return (
    <span className={cn("tabular", className)}>
      {s.slice(0, i)}
      <span className="ml-1 text-[0.55em] font-medium text-muted">{s.slice(i + 1)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ finding */

/** The best route of one kind under the chosen objective (most received; fastest known; most within deadline). */
function bestFor(data: ComparisonResponse, usdc: boolean) {
  const pool = data.routes.filter((r) => (r.type === "usdc") === usdc);
  const amt = (r: RouteResult) => Number(r.recipient_amount);
  const known = pool.filter((r) => r.duration.known && r.duration.typical != null);
  if (data.request.objective === "FASTEST") {
    return [...known].sort((a, b) => a.duration.typical! - b.duration.typical! || amt(b) - amt(a))[0];
  }
  if (data.request.objective === "WITHIN_DEADLINE" && data.request.deadline_minutes) {
    const within = known.filter((r) => r.duration.typical! <= data.request.deadline_minutes!);
    return within.sort((a, b) => amt(b) - amt(a))[0];
  }
  return bestOf(data, usdc);
}

/** The screen's one finding, in words: best USDC against best conventional (under the ranking objective),
    on money and on time. */
export function Finding({ data }: { data: ComparisonResponse }) {
  const usdc = bestFor(data, true);
  const conv = bestFor(data, false);
  const ccy = data.request.destination_currency;
  const objective = data.request.objective ?? "MOST_RECEIVED";
  const which = objective === "FASTEST" ? "fastest" : objective === "WITHIN_DEADLINE" ? "best in-deadline" : "best";
  const usdcCount = data.routes.filter((r) => r.type === "usdc").length;
  if (!usdc && !conv) {
    return <>{objective === "MOST_RECEIVED" ? "No eligible route for this corridor and amount." : "No route meets this objective; see the table for all priced routes."}</>;
  }
  if (!usdc) {
    return usdcCount ? (
      <>No USDC route meets this objective; {usdcCount} USDC routes are priced below.</>
    ) : (
      <>No USDC route is available here; {data.routes.length} conventional routes priced.</>
    );
  }
  if (!conv) return <>No conventional route meets this objective; {usdcCount} USDC routes compared.</>;
  const d = shown(usdc.recipient_amount, ccy) - shown(conv.recipient_amount, ccy);
  const dStr = money(String(Math.abs(d)), ccy);
  const tu = usdc.duration.known ? usdc.duration.typical : null;
  const tc = conv.duration.known ? conv.duration.typical : null;
  return (
    <>
      The {which} USDC route delivers{" "}
      <span className={cn("font-medium tabular", d > 0 ? "text-ok" : d < 0 ? "text-danger" : "text-text")}>
        {d === 0 ? "the same amount as" : `${dStr} ${d > 0 ? "more" : "less"} than`}
      </span>{" "}
      {shortName(conv)}
      {tu != null && tc != null ? (
        <>
          , arriving in <span className="text-text">{minutes(tu)}</span> against <span className="text-text">{minutes(tc)}</span>.
        </>
      ) : (
        <>; one of the two times is unknown.</>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ verdict */

export function Verdict({
  data,
  onOpen,
  chart,
}: {
  data: ComparisonResponse;
  onOpen: (id: string) => void;
  chart?: ReactNode;
}) {
  const byId = (id?: string | null) => data.routes.find((r) => r.id === id);
  const rec = byId(data.recommended_route_id);
  const most = byId(data.most_received_route_id);
  const fast = byId(data.fastest_route_id);
  const conv = bestOf(data, false);
  const ccy = data.request.destination_currency;
  const delta = rec && conv && rec.id !== conv.id ? shown(rec.recipient_amount, ccy) - shown(conv.recipient_amount, ccy) : null;
  const fx = data.reference_fx;
  const reference = fx ? String(Number(data.request.send_amount) * Number(fx.rate)) : null;

  const rows = [
    most && most.id !== rec?.id && { key: "Most received", r: most },
    { key: "Fastest known", r: fast, empty: "No route has a known time." },
    conv && conv.id !== rec?.id && { key: "Best conventional", r: conv },
  ].filter(Boolean) as { key: string; r?: RouteResult; empty?: string }[];

  return (
    <Card aria-labelledby="rec-title">
      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex flex-col p-5 lg:border-r lg:border-rule">
          <h2 id="rec-title" className="text-base font-semibold">Recommended route</h2>
          {rec ? (
            <>
              <p className="mt-4 text-[13px] text-muted">Recipient receives</p>
              <button onClick={() => onOpen(rec.id)} className="mt-1 block text-left transition hover:opacity-80">
                <Amount amount={rec.recipient_amount} unit={rec.recipient_currency} className="text-[32px] font-bold leading-9 tracking-tight" />
              </button>
              <p className="mt-2 text-sm text-muted">
                in <span className="text-text">{minutes(rec.duration.typical)}</span> · all-in cost{" "}
                <span className="tabular text-text">{pct(rec.all_in_cost_pct)}</span> vs ECB mid
              </p>
              {delta != null && (
                <p className="mt-1 text-sm text-muted">
                  <span className={cn("font-medium tabular", delta > 0 ? "text-ok" : delta < 0 ? "text-danger" : "text-text")}>
                    {money(String(delta), ccy, { sign: true })}
                  </span>{" "}
                  vs best conventional ({conv && shortName(conv)})
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <Badge tone={rec.type === "usdc" ? "accent" : "neutral"}>
                  {ROUTE_TYPE_LABEL[rec.type]}
                  {rec.network ? ` · ${networkName(rec)}` : ""}
                </Badge>
                <QualityBadge r={rec} />
              </div>
              <button
                onClick={() => onOpen(rec.id)}
                className="group mt-4 flex w-full items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5 text-left text-[13px] leading-5 transition hover:bg-active"
              >
                <RoutePath label={rec.label} className="min-w-0 flex-1" />
                <span className="flex flex-none items-center gap-0.5 text-muted transition group-hover:text-text">
                  Breakdown <Chevron />
                </span>
              </button>
              {data.recommendation_reason && (
                <Disclosure summary="Why this route" className="mt-3">
                  <p className="text-[13px] leading-5 text-muted">{data.recommendation_reason}</p>
                </Disclosure>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">{data.recommendation_reason || "No eligible route."}</p>
          )}

          <ul className="mt-5 text-sm" aria-label="Alternatives to the recommended route">
            {rows.map(({ key, r, empty }) => (
              <li key={key} className="border-t border-rule">
                <button
                  disabled={!r}
                  onClick={() => r && onOpen(r.id)}
                  className="flex w-full items-start gap-3 py-2.5 text-left transition enabled:hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {r ? <Dot tone={routeTone(r)} /> : <span className="w-2" />}
                      <span className="font-medium">{key}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-4 text-[13px] text-muted">{r ? shortName(r) : empty}</span>
                  </span>
                  <span className="flex-none text-right tabular">
                    {r ? money(r.recipient_amount, r.recipient_currency) : <span className="text-muted">—</span>}
                    <span className="mt-0.5 block text-[13px] text-muted">{r ? minutes(r.duration.typical) : ""}</span>
                  </span>
                </button>
              </li>
            ))}
            {reference && (
              <li className="flex items-start gap-3 border-t border-rule py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-px w-2 bg-faint" />
                    <span className="font-medium">ECB mid-rate benchmark</span>
                  </span>
                  <span className="mt-0.5 block pl-4 text-[13px] text-muted">Not executable · the zero-cost line</span>
                </span>
                <span className="flex-none text-right tabular text-muted">{money(reference, ccy)}</span>
              </li>
            )}
          </ul>
        </div>
        <div className="min-w-0 border-t border-rule p-5 lg:border-t-0">{chart}</div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ status */

/** Freshness and quote-status line under the title, with an expandable snapshot record. */
export function StatusLine({ data, readOnly }: { data: ComparisonResponse; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const fx = data.reference_fx;
  const usdc = data.routes.filter((r) => r.type === "usdc").length;
  const conv = data.routes.length - usdc;
  const gaps = data.source_errors.length;
  return (
    <div className="text-[13px] text-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-text">Simulation / estimate, not a payment quote</span>
        <span aria-hidden>·</span>
        <span>{readOnly ? `Snapshot from ${when(data.snapshot.created_at)}` : `Market data ${ago(data.snapshot.created_at)}`}</span>
        <span aria-hidden>·</span>
        <span className="tabular">{data.routes.length} routes priced</span>
        {gaps > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5 text-danger">
              <Dot tone="danger" /> {gaps} source {gaps === 1 ? "error" : "errors"}
            </span>
          </>
        )}
        {data.is_simulation_override && <Badge tone="warn">Scenario overrides active</Badge>}
        {readOnly && <Badge>Read-only snapshot</Badge>}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-text underline-offset-2 hover:underline sm:ml-auto">
          {open ? "Hide snapshot details" : "Snapshot details"}
          <Chevron className={cn("transition", open ? "-rotate-90" : "rotate-90")} />
        </button>
      </div>

      {(data.snapshot.data_mode === "fixture" || data.warnings.length > 0) && (
        <ul className="mt-3 space-y-1 rounded-md border border-warn-edge bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {data.snapshot.data_mode === "fixture" && !data.warnings.some((w) => w.toLowerCase().includes("fixture")) && (
            <li>Recorded fixture data: market payloads are replayed, not current prices.</li>
          )}
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {open && (
        <dl className="mt-3 grid gap-x-8 gap-y-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
          <div>
            <dt>Reference mid-rate</dt>
            <dd className="mt-0.5 text-text">
              {fx ? (
                <>
                  <span className="tabular">{Number(fx.rate).toFixed(6)}</span> {fx.unit} · ECB {fx.observed_at ? new Date(fx.observed_at).toLocaleDateString() : ""}
                  {fx.cross_check && (
                    <span className="text-muted">
                      {" "}
                      · BoC <span className="tabular">{Number(fx.cross_check.rate).toFixed(6)}</span> ({String(fx.cross_check.diff_bps)} bps)
                    </span>
                  )}
                </>
              ) : (
                <span className="text-danger">Unavailable, so cost against the mid-rate cannot be computed</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Snapshot</dt>
            <dd className="mt-0.5 text-text">
              {when(data.snapshot.created_at)} · <span className="tabular">{data.snapshot.observation_count}</span> observations{" "}
              <span className="font-mono text-muted">{data.snapshot.id}</span>
            </dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd className="mt-0.5 tabular text-text">
              {usdc} USDC and {conv} conventional eligible · {data.excluded.length} excluded
            </dd>
          </div>
          <div>
            <dt>Data gaps</dt>
            <dd className="mt-0.5 text-text">
              {gaps === 0 ? "All sources responded." : data.source_errors.map((e) => `${e.source_id} (${e.message})`).join(", ")}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ table */

type SortKey = "received" | "cost" | "time";
const PAGE = 8;

export function RouteTable({ data, onOpen }: { data: ComparisonResponse; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>("received");
  const [kind, setKind] = useState<"all" | "usdc" | "conv">("all");
  const [network, setNetwork] = useState("all");
  const [paretoOnly, setParetoOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const src = data.request.source_currency;
  const pareto = new Set(data.pareto_route_ids);
  const networks = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data.routes) if (r.network && !m.has(r.network)) m.set(r.network, networkName(r) ?? r.network);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const rows = useMemo(() => {
    let rs = data.routes.filter((r) => kind === "all" || (kind === "usdc") === (r.type === "usdc"));
    if (network !== "all") rs = rs.filter((r) => r.type !== "usdc" || r.network === network);
    if (paretoOnly) rs = rs.filter((r) => pareto.has(r.id));
    const t = (r: RouteResult) => (r.duration.known ? (r.duration.typical ?? Infinity) : Infinity);
    const cost = (r: RouteResult) => (r.all_in_cost_pct == null ? Infinity : Number(r.all_in_cost_pct));
    return [...rs].sort((a, b) =>
      sort === "received"
        ? Number(b.recipient_amount) - Number(a.recipient_amount)
        : sort === "cost"
          ? cost(a) - cost(b) || Number(b.recipient_amount) - Number(a.recipient_amount)
          : t(a) - t(b) || Number(b.recipient_amount) - Number(a.recipient_amount),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, kind, network, paretoOnly]);
  const visible = expanded ? rows : rows.slice(0, PAGE);

  const th = "h-10 px-3 text-xs font-normal text-muted";
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={cn("inline-flex items-center gap-0.5 transition hover:text-text", sort === k && "font-medium text-text")}>
      {label}
      {sort === k && (
        <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 3v10M4 9l4 4 4-4" />
        </svg>
      )}
    </button>
  );

  return (
    <Card aria-labelledby="routes-title">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 id="routes-title" className="text-base font-semibold">
            All routes <span className="font-normal tabular text-muted">{rows.length}</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Every route debits the same {money(data.request.send_amount, src)}. Cost is measured against the ECB mid-rate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Route type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All" },
              { value: "usdc", label: "USDC" },
              { value: "conv", label: "Conventional" },
            ]}
          />
          {kind !== "conv" && networks.length > 1 && (
            <select aria-label="Network" className={inputBase} value={network} onChange={(e) => setNetwork(e.target.value)}>
              <option value="all">All networks</option>
              {networks.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            aria-pressed={paretoOnly}
            onClick={() => setParetoOnly((p) => !p)}
            title="Only routes not beaten on both amount and time by another route"
            className={cn(
              "h-9 rounded-md px-3 text-[13px] font-medium transition",
              paretoOnly ? "bg-primary text-primary-ink" : "bg-active text-muted hover:text-text",
            )}
          >
            Best trade-offs only
          </button>
        </div>
      </div>

      {/* Desktop and tablet: a table. Phone: two-line rows (below). */}
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[150px]" />
            <col className="w-[130px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th className={cn(th, "pl-5 text-left")}>Route</th>
              <th className={cn(th, "text-right")} aria-sort={sort === "received" ? "descending" : "none"}>{sortBtn("received", "Recipient gets")}</th>
              <th className={cn(th, "text-right")} aria-sort={sort === "cost" ? "ascending" : "none"}>{sortBtn("cost", "All-in cost")}</th>
              <th className={cn(th, "pr-5 text-right")} aria-sort={sort === "time" ? "ascending" : "none"}>{sortBtn("time", "Typical time")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(r.id))}
                className="cursor-pointer border-b border-rule transition last:border-0 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <td className="py-2.5 pl-5 pr-3">
                  <div className="truncate text-[13px] leading-5">
                    <RoutePath label={r.label} />
                  </div>
                  <RouteMeta r={r} data={data} />
                </td>
                <td className="px-3 py-2.5 text-right align-top font-medium tabular">{money(r.recipient_amount, r.recipient_currency)}</td>
                <td className="px-3 py-2.5 text-right align-top tabular">
                  {pct(r.all_in_cost_pct)}
                  <div className="text-xs text-muted">{money(r.total_cost_source, src)}</div>
                </td>
                <td className="py-2.5 pl-3 pr-5 text-right align-top tabular">
                  {minutes(r.duration.typical)}
                  <div className="text-xs text-muted">{durationRange(r.duration)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="border-t border-border sm:hidden">
        {visible.map((r) => (
          <li key={r.id} className="border-b border-rule last:border-0">
            <button onClick={() => onOpen(r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{shortName(r)}</span>
                <RouteMeta r={r} data={data} />
              </span>
              <span className="flex-none text-right tabular">
                <span className="block text-sm font-medium">{money(r.recipient_amount, r.recipient_currency)}</span>
                <span className="block text-xs text-muted">
                  {pct(r.all_in_cost_pct)} · {minutes(r.duration.typical)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border px-5 py-3">
        <ExcludedRoutes data={data} />
        {rows.length > PAGE && (
          <button onClick={() => setExpanded((e) => !e)} className="ml-auto text-[13px] font-medium text-text hover:underline">
            {expanded ? "Show fewer" : `View all ${rows.length}`}
          </button>
        )}
      </div>
    </Card>
  );
}

function RouteMeta({ r, data }: { r: RouteResult; data: ComparisonResponse }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
      <Dot tone={routeTone(r)} />
      <span>{ROUTE_TYPE_LABEL[r.type]}</span>
      {r.network && <span>· {networkName(r)}</span>}
      {r.id === data.recommended_route_id && <span className="font-medium text-text">· Recommended</span>}
      {r.id === data.fastest_route_id && <span className="font-medium text-text">· Fastest</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ excluded */

export function ExcludedRoutes({ data }: { data: ComparisonResponse }) {
  const groups = useMemo(() => {
    const m = new Map<string, RouteResult[]>();
    for (const r of data.excluded) {
      const code = r.exclusion_codes?.[0] ?? "UNKNOWN";
      m.set(code, [...(m.get(code) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);
  if (data.excluded.length === 0) return <span className="text-[13px] text-muted">No routes excluded.</span>;
  return (
    <Disclosure summary={`${data.excluded.length} unavailable routes and why`} className="min-w-0 flex-1">
      <div className="space-y-4 text-[13px]">
        {groups.map(([code, rs]) => (
          <div key={code}>
            <h3 className="font-medium">
              {EXCLUSION_LABEL[code] ?? code} <span className="font-normal tabular text-muted">{rs.length}</span>
            </h3>
            <ul className="mt-1 space-y-1 text-muted">
              {rs.slice(0, 30).map((r) => (
                <li key={r.id}>
                  <span className="text-text">{r.label}</span>: {r.exclusion_reasons?.join("; ")}
                </li>
              ))}
              {rs.length > 30 && <li>…and {rs.length - 30} more (see the CSV export)</li>}
            </ul>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
