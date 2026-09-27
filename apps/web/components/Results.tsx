"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { ago, durationRange, EXCLUSION_LABEL, minutes, money, pct, ROUTE_TYPE_LABEL, when } from "@/lib/format";
import { Badge, Card, cn, Disclosure, Dot, inputBase, RoutePath, Segmented } from "./ui";

export function routeTone(r: Pick<RouteResult, "type">) {
  return r.type === "usdc" ? "accent" : "conv";
}

export function QualityBadge({ r }: { r: RouteResult }) {
  if (r.recommendation_grade === "current") return <Badge tone="ok">Current</Badge>;
  const t = { live: "Live prices", mixed: "Mixed inputs", assumed: "Assumed" }[r.input_quality ?? "assumed"];
  return (
    <Badge tone={r.input_quality === "live" ? "ok" : "warn"} title="Research scenario: some legs are assumptions or unreviewed tariffs">
      {t} · research
    </Badge>
  );
}

/** "1,551.77 EUR" → big number + small unit. */
function BigMoney({ amount, unit, className }: { amount: string | null | undefined; unit: string; className?: string }) {
  const s = money(amount, unit);
  const i = s.lastIndexOf(" ");
  return (
    <span className={cn("display tabular", className)}>
      {s.slice(0, i)}
      <span className="ml-2 font-sans text-[0.32em] font-medium tracking-normal text-muted">{s.slice(i + 1)}</span>
    </span>
  );
}

function bestConventional(data: ComparisonResponse) {
  return data.routes.filter((r) => r.type !== "usdc").sort((a, b) => Number(b.recipient_amount) - Number(a.recipient_amount))[0];
}

/* ------------------------------------------------------------------ verdict */

export function Verdict({ data, onOpen, action }: { data: ComparisonResponse; onOpen: (id: string) => void; action?: ReactNode }) {
  const byId = (id?: string | null) => data.routes.find((r) => r.id === id);
  const rec = byId(data.recommended_route_id);
  const most = byId(data.most_received_route_id);
  const fast = byId(data.fastest_route_id);
  const conv = bestConventional(data);
  const delta = rec && conv && rec.id !== conv.id ? Number(rec.recipient_amount) - Number(conv.recipient_amount) : null;

  const alts = [
    most && most.id !== rec?.id && { key: "Most received", r: most },
    { key: "Fastest", r: fast, empty: "No route has a known time." },
    conv && conv.id !== rec?.id && { key: "Best conventional", r: conv },
  ].filter(Boolean) as { key: string; r?: RouteResult; empty?: string }[];

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow">Recommended</h2>
            {action}
          </div>
          {rec ? (
            <>
              <button onClick={() => onOpen(rec.id)} className="mt-4 block text-left">
                <BigMoney amount={rec.recipient_amount} unit={rec.recipient_currency} className="text-6xl leading-none md:text-7xl" />
              </button>
              <p className="mt-3 text-sm text-muted">
                lands in the recipient&apos;s bank in <span className="text-text">{minutes(rec.duration.typical)}</span> · all-in cost{" "}
                <span className="text-text tabular">{pct(rec.all_in_cost_pct)}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {delta != null && (
                  <Badge tone={delta >= 0 ? "ok" : "danger"}>
                    {money(String(delta), rec.recipient_currency, { sign: true })} vs best conventional
                  </Badge>
                )}
                <Badge tone={routeTone(rec)}>{ROUTE_TYPE_LABEL[rec.type]}{rec.network ? ` · ${rec.network}` : ""}</Badge>
                <QualityBadge r={rec} />
              </div>
              <button
                onClick={() => onOpen(rec.id)}
                className="group mt-6 flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-[13px] transition hover:border-border-strong hover:bg-surface-2/50"
              >
                <RoutePath label={rec.label} className="min-w-0 flex-1" />
                <span className="hidden shrink-0 text-xs text-muted transition group-hover:text-text sm:inline">Breakdown →</span>
              </button>
              {data.recommendation_reason && (
                <Disclosure summary="Why this route" className="mt-4">
                  <p className="max-w-2xl text-xs leading-relaxed text-muted">{data.recommendation_reason}</p>
                </Disclosure>
              )}
            </>
          ) : (
            <p className="mt-4 max-w-xl text-sm text-muted">{data.recommendation_reason || "No eligible route."}</p>
          )}
        </div>

        <div className="flex flex-col border-t border-border bg-surface-2/40 md:border-l md:border-t-0">
          {alts.map(({ key, r, empty }) => (
            <button
              key={key}
              disabled={!r}
              onClick={() => r && onOpen(r.id)}
              className="flex flex-1 flex-col justify-center gap-1 border-b border-border px-6 py-5 text-left transition last:border-0 enabled:hover:bg-surface-2"
            >
              <span className="eyebrow">{key}</span>
              {r ? (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-medium tabular">{money(r.recipient_amount, r.recipient_currency)}</span>
                    <span className="text-xs text-muted tabular">{minutes(r.duration.typical)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                    <Dot tone={routeTone(r)} />
                    <span className="truncate">{r.label}</span>
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted">{empty ?? "No eligible route."}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ status */

export function StatusLine({ data, readOnly }: { data: ComparisonResponse; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const fx = data.reference_fx;
  const usdc = data.routes.filter((r) => r.type === "usdc").length;
  const conv = data.routes.length - usdc;
  const gaps = data.source_errors.length;
  return (
    <div className="px-1 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <Dot tone="warn" />
          Simulation / estimate — not a payment quote
        </span>
        <span className="text-faint">·</span>
        <span>Market data {ago(data.snapshot.created_at)}</span>
        <span className="text-faint">·</span>
        <span>{data.routes.length} routes compared</span>
        {gaps > 0 && (
          <span className="inline-flex items-center gap-1.5 text-danger">
            <Dot tone="danger" /> {gaps} source {gaps === 1 ? "error" : "errors"}
          </span>
        )}
        {data.snapshot.data_mode === "fixture" && <Badge tone="warn">Recorded fixture data</Badge>}
        {data.is_simulation_override && <Badge tone="warn">Scenario overrides active</Badge>}
        {readOnly && <Badge>Read-only shared snapshot</Badge>}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto underline-offset-2 hover:text-text hover:underline">
          {open ? "Hide details" : "Data details"}
        </button>
      </div>

      {open && (
        <dl className="mt-3 grid gap-x-8 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
          <div>
            <dt className="text-faint">Reference mid-rate</dt>
            <dd className="mt-0.5 text-text">
              {fx ? (
                <>
                  <span className="tabular">{Number(fx.rate).toFixed(6)}</span> {fx.unit} · ECB {fx.observed_at ? new Date(fx.observed_at).toLocaleDateString() : ""}
                  {fx.cross_check && (
                    <span className="text-muted">
                      {" "}
                      · BoC {Number(fx.cross_check.rate).toFixed(6)} ({String(fx.cross_check.diff_bps)} bps)
                    </span>
                  )}
                </>
              ) : (
                <span className="text-danger">unavailable — cost vs mid cannot be computed</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-faint">Snapshot</dt>
            <dd className="mt-0.5 text-text">
              {when(data.snapshot.created_at)} · {data.snapshot.observation_count} observations{" "}
              <span className="font-mono text-muted">{data.snapshot.id}</span>
            </dd>
          </div>
          <div>
            <dt className="text-faint">Coverage</dt>
            <dd className="mt-0.5 text-text">
              {usdc} USDC + {conv} conventional eligible · {data.excluded.length} excluded
            </dd>
          </div>
          <div>
            <dt className="text-faint">Data gaps</dt>
            <dd className="mt-0.5 text-text">
              {gaps === 0 ? "All sources responded." : data.source_errors.map((e) => `${e.source_id} (${e.message})`).join(", ")}
            </dd>
          </div>
        </dl>
      )}

      {data.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-warn">
          {data.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <Dot tone="warn" className="mt-1.5" />
              {w}
            </li>
          ))}
        </ul>
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
  const networks = useMemo(() => [...new Set(data.routes.map((r) => r.network).filter(Boolean))] as string[], [data]);

  const rows = useMemo(() => {
    let rs = data.routes.filter((r) => kind === "all" || (kind === "usdc") === (r.type === "usdc"));
    if (network !== "all") rs = rs.filter((r) => r.type !== "usdc" || r.network === network);
    if (paretoOnly) rs = rs.filter((r) => pareto.has(r.id));
    const t = (r: RouteResult) => (r.duration.known ? (r.duration.typical ?? Infinity) : Infinity);
    return [...rs].sort((a, b) =>
      sort === "received"
        ? Number(b.recipient_amount) - Number(a.recipient_amount)
        : sort === "cost"
          ? Number(a.all_in_cost_pct) - Number(b.all_in_cost_pct)
          : t(a) - t(b) || Number(b.recipient_amount) - Number(a.recipient_amount),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, kind, network, paretoOnly]);
  const shown = expanded ? rows : rows.slice(0, PAGE);

  const th = "px-3 py-2.5 text-[11px] font-medium text-faint";
  const sortBtn = (k: SortKey, label: string) => (
    <button onClick={() => setSort(k)} className={cn("transition hover:text-text", sort === k && "text-text")}>
      {label}
      <span className={cn("ml-0.5", sort !== k && "invisible")}>↓</span>
    </button>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight">
            All routes <span className="font-normal text-faint">{rows.length}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">Same {money(data.request.send_amount, src)} debit for every route. Cost is vs the ECB mid-rate.</p>
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
            <select aria-label="Network" className={cn(inputBase, "rounded-full border-transparent bg-surface-2 py-1 text-xs")} value={network} onChange={(e) => setNetwork(e.target.value)}>
              <option value="all">All networks</option>
              {networks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          <button
            aria-pressed={paretoOnly}
            onClick={() => setParetoOnly((p) => !p)}
            title="Only routes not beaten on both amount and time by another route"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              paretoOnly ? "bg-text text-bg" : "bg-surface-2 text-muted hover:text-text",
            )}
          >
            Pareto only
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(th, "pl-5 text-left")}>Route</th>
              <th className={cn(th, "text-right")} aria-sort={sort === "received" ? "descending" : "none"}>{sortBtn("received", "Recipient gets")}</th>
              <th className={cn(th, "text-right")} aria-sort={sort === "cost" ? "ascending" : "none"}>{sortBtn("cost", "Cost")}</th>
              <th className={cn(th, "pr-5 text-right")} aria-sort={sort === "time" ? "ascending" : "none"}>{sortBtn("time", "Time")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(r.id))}
                className="group cursor-pointer border-b border-border transition last:border-0 hover:bg-surface-2/60 focus:bg-surface-2/60 focus:outline-none"
              >
                <td className="max-w-[460px] py-3 pl-5 pr-3">
                  <div className="truncate text-[13px]">
                    <RoutePath label={r.label} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                    <Dot tone={routeTone(r)} />
                    <span>{ROUTE_TYPE_LABEL[r.type]}</span>
                    {r.network && <span className="text-faint">· {r.network}</span>}
                    {r.id === data.recommended_route_id && <span className="font-medium text-accent">· Recommended</span>}
                    {r.id === data.fastest_route_id && <span className="font-medium text-text">· Fastest</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-medium tabular">{money(r.recipient_amount, r.recipient_currency)}</td>
                <td className={cn("px-3 py-3 text-right tabular", Number(r.all_in_cost_pct) < 0 && "text-ok")}>
                  {pct(r.all_in_cost_pct)}
                  <div className="text-[11px] text-faint">{money(r.total_cost_source, src)}</div>
                </td>
                <td className="py-3 pl-3 pr-5 text-right tabular">
                  {minutes(r.duration.typical)}
                  <div className="text-[11px] text-faint">{durationRange(r.duration)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <ExcludedRoutes data={data} />
        {rows.length > PAGE && (
          <button onClick={() => setExpanded((e) => !e)} className="ml-auto text-xs font-medium text-muted hover:text-text">
            {expanded ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </Card>
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
  if (data.excluded.length === 0) return <span />;
  return (
    <Disclosure summary={`${data.excluded.length} unavailable routes`} className="min-w-0 flex-1">
      <div className="space-y-4 text-xs">
        {groups.map(([code, rs]) => (
          <div key={code}>
            <h4 className="font-medium">
              {EXCLUSION_LABEL[code] ?? code} <span className="font-normal text-faint">{rs.length}</span>
            </h4>
            <ul className="mt-1 space-y-1 text-muted">
              {rs.slice(0, 30).map((r) => (
                <li key={r.id}>
                  <span className="text-text">{r.label}</span> — {r.exclusion_reasons?.join("; ")}
                </li>
              ))}
              {rs.length > 30 && <li className="text-faint">…and {rs.length - 30} more (see CSV export)</li>}
            </ul>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
