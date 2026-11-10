"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { ago, durationRange, EXCLUSION_LABEL, minutes, money, pct, ROUTE_TYPE_LABEL, when } from "@/lib/format";
import { Badge, Card, Chevron, cn, Disclosure, Dot, inputBase, Segmented } from "./ui";

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

/** Split a route label into hops on top-level arrows only ("Wise transfer (bank → bank)" stays one hop). */
function hops(label: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of label) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "→" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((h): { name: string; detail?: string } => {
    const m = h.trim().match(/^(.*?)\s*\((.*)\)$/);
    return m ? { name: m[1], detail: m[2] } : { name: h.trim() };
  });
}

/** A route drawn as its hops: sender venue → network chip → recipient venue; rails as a quiet second line. */
export function RouteHops({ r, rails = true, className, extra }: { r: RouteResult; rails?: boolean; className?: string; extra?: ReactNode }) {
  const hs = hops(r.label);
  if (r.type !== "usdc" || hs.length < 3) {
    return (
      <span className={cn("min-w-0", className)} title={r.label}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{shortName(r)}</span>
          {extra}
        </span>
        {rails && <span className="block truncate text-xs text-muted">{ROUTE_TYPE_LABEL[r.type]}{hs[0]?.detail ? ` · ${hs[0].detail}` : ""}</span>}
      </span>
    );
  }
  const [from, , to] = [hs[0], hs[1], hs[hs.length - 1]];
  return (
    <span className={cn("min-w-0", className)} title={r.label}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{from.name}</span>
        <Arrow />
        <NetworkChip name={networkName(r) ?? "USDC"} />
        <Arrow />
        <span className="truncate font-medium">{to.name}</span>
        {extra && <span className="ml-1 flex-none">{extra}</span>}
      </span>
      {rails && (from.detail || to.detail) && (
        <span className="block truncate text-xs text-muted">
          {from.detail ?? "—"} in · {to.detail ?? "—"} out
        </span>
      )}
    </span>
  );
}

function Arrow() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 flex-none text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 6h8M7 3l3 3-3 3" />
    </svg>
  );
}

export function NetworkChip({ name }: { name: string }) {
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full bg-accent-soft px-2 py-px text-xs font-medium text-accent-ink">
      <Dot tone="accent" className="h-1.5 w-1.5" />
      {name}
    </span>
  );
}

function bestOf(data: ComparisonResponse, usdc: boolean) {
  return data.routes.filter((r) => (r.type === "usdc") === usdc).sort((a, b) => Number(b.recipient_amount) - Number(a.recipient_amount))[0];
}

/** What the recipient would get at the ECB mid-rate with zero cost (the analytical ceiling). */
function referenceOf(data: ComparisonResponse) {
  const fx = data.reference_fx;
  return fx ? Number(data.request.send_amount) * Number(fx.rate) : null;
}

/* ------------------------------------------------------------------ finding */

/** The screen's one finding, in a few words: who wins on money, by how much. */
export function Finding({ data }: { data: ComparisonResponse }) {
  const v = verdictOf(data);
  return <>{v.text}</>;
}

function verdictOf(data: ComparisonResponse): { text: ReactNode; tone: "ok" | "danger" | "neutral"; usdcWins: boolean | null } {
  const usdc = bestOf(data, true);
  const conv = bestOf(data, false);
  const ccy = data.request.destination_currency;
  if (!usdc && !conv) return { text: "No eligible route for this amount", tone: "neutral", usdcWins: null };
  if (!usdc) return { text: "No USDC route here, conventional only", tone: "neutral", usdcWins: null };
  if (!conv) return { text: "Only USDC routes are priced here", tone: "neutral", usdcWins: null };
  const d = shown(usdc.recipient_amount, ccy) - shown(conv.recipient_amount, ccy);
  if (d === 0) return { text: `USDC and ${shortName(conv)} tie`, tone: "neutral", usdcWins: null };
  const amt = money(String(Math.abs(d)), ccy);
  return d > 0
    ? { text: <>USDC delivers <span className="whitespace-nowrap">{amt}</span> more than {shortName(conv)}</>, tone: "ok", usdcWins: true }
    : { text: <>{shortName(conv)} delivers <span className="whitespace-nowrap">{amt}</span> more than USDC</>, tone: "danger", usdcWins: false };
}

/* ------------------------------------------------------------------ hero */

type Contender = { r: RouteResult; name: string; sub: string; loss: number | null };

/** The few routes that answer the question: best and fastest USDC, and the best of each conventional kind. */
function contenders(data: ComparisonResponse): Contender[] {
  const ref = referenceOf(data);
  const ccy = data.request.destination_currency;
  const byAmount = [...data.routes].sort((a, b) => Number(b.recipient_amount) - Number(a.recipient_amount));
  const known = (r: RouteResult) => (r.duration.known ? (r.duration.typical ?? Infinity) : Infinity);
  const picks: { r?: RouteResult; name: string; sub?: string }[] = [];
  const bestU = byAmount.find((r) => r.type === "usdc");
  const fastU = [...data.routes].filter((r) => r.type === "usdc").sort((a, b) => known(a) - known(b) || Number(b.recipient_amount) - Number(a.recipient_amount))[0];
  picks.push({ r: bestU, name: "Best USDC" });
  if (fastU && fastU.id !== bestU?.id && known(fastU) < known(bestU!)) picks.push({ r: fastU, name: "Fastest USDC" });
  for (const t of ["conventional_provider", "bank_wire"] as const) {
    const r = byAmount.find((x) => x.type === t);
    picks.push({ r, name: r ? shortName(r) : ROUTE_TYPE_LABEL[t] });
  }
  return picks
    .filter((p): p is { r: RouteResult; name: string } => !!p.r)
    .map((p) => ({
      r: p.r,
      name: p.name,
      sub: p.r.type === "usdc" ? `via ${networkName(p.r)}` : ROUTE_TYPE_LABEL[p.r.type],
      loss: ref != null ? Math.max(0, ref - shown(p.r.recipient_amount, ccy)) : null,
    }));
}

export function Hero({ data, onOpen, controls }: { data: ComparisonResponse; onOpen: (id: string) => void; controls?: ReactNode }) {
  const byId = (id?: string | null) => data.routes.find((r) => r.id === id);
  const rec = byId(data.recommended_route_id);
  const v = verdictOf(data);
  const ref = referenceOf(data);
  const ccy = data.request.destination_currency;
  const src = data.request.source_currency;
  const rows = contenders(data);
  const maxLoss = Math.max(...rows.map((c) => c.loss ?? 0), 0.0001);

  return (
    <Card aria-labelledby="rec-title" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold leading-6">
          <VerdictIcon tone={v.tone} />
          <span>{v.text}</span>
        </p>
        {controls}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* The answer: one hero figure and three tiles */}
        <div className="flex flex-col p-5 lg:border-r lg:border-rule">
          <h2 id="rec-title" className="text-[13px] font-medium text-muted">
            Recommended · recipient gets
          </h2>
          {rec ? (
            <>
              <button onClick={() => onOpen(rec.id)} className="mt-1 block text-left transition hover:opacity-80" aria-label={`Open ${rec.label}`}>
                <BigAmount amount={rec.recipient_amount} unit={rec.recipient_currency} />
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                <span>with</span>
                {rec.type === "usdc" ? <NetworkChip name={networkName(rec) ?? "USDC"} /> : <span className="font-medium text-text">{shortName(rec)}</span>}
                {rec.type === "usdc" && <span>USDC</span>}
              </div>
              <dl className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-border">
                <Tile label="Arrives in" value={minutes(rec.duration.typical)} />
                <Tile label="All-in cost" value={pct(rec.all_in_cost_pct)} />
                <Tile label="Fees + FX" value={money(rec.total_cost_source, src)} />
              </dl>
              <button
                onClick={() => onOpen(rec.id)}
                className="group mt-4 flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-left text-[13px] transition hover:bg-active"
              >
                <RouteHops r={rec} rails={false} className="flex-1" />
                <span className="flex flex-none items-center gap-0.5 text-muted transition group-hover:text-text">
                  Step by step <Chevron />
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
        </div>

        {/* Head-to-head: what each option loses against the mid-market rate */}
        <div className="min-w-0 border-t border-rule p-5 lg:border-t-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Head to head</h2>
            <span className="text-xs text-muted">Lost to fees and FX · shorter is better</span>
          </div>
          {ref == null ? (
            <p className="mt-4 text-[13px] text-muted">Reference FX is unavailable, so losses can&apos;t be measured.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1" aria-label="Best route of each kind">
              {rows.map((c) => (
                <li key={c.r.id}>
                  <button
                    onClick={() => onOpen(c.r.id)}
                    className="grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md px-2 py-2.5 text-left transition hover:bg-surface-2 sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_6.5rem_5.5rem]"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Dot tone={routeTone(c.r)} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="block truncate pl-4 text-xs text-muted">
                        {c.sub}
                        {c.r.id === rec?.id && <span className="font-medium text-text"> · Recommended</span>}
                      </span>
                    </span>
                    <span className="h-2.5 rounded-r-[4px] bg-active" aria-hidden>
                      <span
                        className="block h-full rounded-r-[4px] transition-[width] duration-500"
                        style={{
                          width: c.loss ? `max(3px, ${(c.loss / maxLoss) * 100}%)` : 0,
                          background: c.r.type === "usdc" ? "var(--accent)" : c.r.type === "bank_wire" ? "var(--conv-2)" : "var(--conv)",
                        }}
                      />
                    </span>
                    <span className="text-right text-sm font-medium tabular">{c.loss ? `−${money(String(c.loss), ccy)}` : "≈ 0"}</span>
                    <span className="col-start-3 text-right text-xs text-muted tabular sm:col-start-auto sm:text-[13px]">
                      <ClockIcon /> {minutes(c.r.duration.typical)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ref != null && (
            <p className="mt-3 flex items-center gap-2 border-t border-rule px-2 pt-3 text-xs text-muted">
              <span aria-hidden className="inline-block h-px w-3 bg-faint" />
              At the ECB mid-rate the recipient would get <span className="font-medium tabular text-text">{money(String(ref), ccy)}</span>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Hero figure: proportional digits at display size, unit as a quiet suffix. */
function BigAmount({ amount, unit }: { amount: string | null | undefined; unit: string }) {
  const s = money(amount, unit);
  const i = s.lastIndexOf(" ");
  return (
    <span className="text-5xl font-semibold leading-[56px] tracking-tight">
      {s.slice(0, i)}
      <span className="ml-1.5 text-xl font-medium text-muted">{s.slice(i + 1)}</span>
    </span>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-rule px-3 py-2.5 [&:nth-child(n+2)]:border-l">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

function VerdictIcon({ tone }: { tone: "ok" | "danger" | "neutral" }) {
  const bg = { ok: "bg-ok-soft text-ok", danger: "bg-danger-soft text-danger", neutral: "bg-active text-muted" }[tone];
  return (
    <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-full", bg)}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {tone === "neutral" ? <path d="M4 8h8" /> : <path d="M3.5 8.5l3 3 6-7" />}
      </svg>
    </span>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="mr-0.5 inline h-3 w-3 -translate-y-px" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ status */

/** One quiet row of chips: what this is, how fresh, how much was priced; the snapshot record on demand. */
export function StatusLine({ data, readOnly }: { data: ComparisonResponse; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const fx = data.reference_fx;
  const usdc = data.routes.filter((r) => r.type === "usdc").length;
  const conv = data.routes.length - usdc;
  const gaps = data.source_errors.length;
  const fixture = data.snapshot.data_mode === "fixture";
  const chip = "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5";
  return (
    <div className="text-xs text-muted">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(chip, "font-medium text-text")}>Estimate, not a quote</span>
        <span className={chip}>
          <span className={cn("h-1.5 w-1.5 rounded-full", fixture || readOnly ? "bg-faint" : "bg-ok")} />
          {readOnly ? `Snapshot ${when(data.snapshot.created_at)}` : fixture ? `Recorded data · ${ago(data.snapshot.created_at)}` : `Live · ${ago(data.snapshot.created_at)}`}
        </span>
        <span className={cn(chip, "tabular")}>{data.routes.length} routes priced</span>
        {gaps > 0 && (
          <span className={cn(chip, "border-danger-soft bg-danger-soft text-danger-ink")}>
            {gaps} source {gaps === 1 ? "error" : "errors"}
          </span>
        )}
        {data.is_simulation_override && <span className={cn(chip, "border-warn-edge bg-warn-soft text-warn")}>What-if overrides on</span>}
        {readOnly && <span className={chip}>Read-only</span>}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-muted transition hover:text-text sm:ml-auto">
          Details
          <Chevron className={cn("transition", open ? "-rotate-90" : "rotate-90")} />
        </button>
      </div>

      {data.warnings.length > 0 && (
        <Disclosure summary={<span className="text-warn">{data.warnings.length} {data.warnings.length === 1 ? "note" : "notes"} on this data</span>} className="mt-2">
          <ul className="space-y-1 rounded-md border border-warn-edge bg-warn-soft px-3 py-2 text-[13px] text-warn">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      {open && (
        <dl className="mt-3 grid gap-x-8 gap-y-4 rounded-lg border border-border bg-surface p-4 text-[13px] sm:grid-cols-2">
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
    for (const r of data.routes) if (r.network) m.set(r.network, networkName(r) ?? r.network);
    return [...m.entries()];
  }, [data]);

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
  const visible = expanded ? rows : rows.slice(0, PAGE);
  // Cost bars share one scale across all rows in view, capped so one outlier can't flatten the rest.
  const costs = rows.map((r) => Math.max(0, Number(r.all_in_cost_pct))).sort((a, b) => a - b);
  const maxCost = Math.max(costs[Math.floor(costs.length * 0.9)] ?? 0, 0.01);

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
  const tag = (r: RouteResult) =>
    r.id === data.recommended_route_id ? <Badge tone="ok">Recommended</Badge> : r.id === data.fastest_route_id ? <Badge>Fastest</Badge> : null;

  return (
    <Card aria-labelledby="routes-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 id="routes-title" className="text-base font-semibold">
          All routes <span className="font-normal tabular text-muted">{rows.length}</span>
        </h2>
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
            Best trade-offs
          </button>
        </div>
      </div>

      {/* Desktop and tablet: a table. Phone: two-line rows (below). */}
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[150px]" />
            <col className="w-[170px] max-md:w-[110px]" />
            <col className="w-[130px]" />
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
            {visible.map((r) => {
              const c = Math.max(0, Number(r.all_in_cost_pct));
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => onOpen(r.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(r.id))}
                  className="cursor-pointer border-b border-rule transition last:border-0 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-2 text-[13px] leading-5">
                      <Dot tone={routeTone(r)} />
                      <RouteHops r={r} className="flex-1" extra={tag(r)} />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular">{money(r.recipient_amount, r.recipient_currency)}</td>
                  <td className="px-3 py-3 tabular" title={`${money(r.total_cost_source, src)} lost against the mid-rate`}>
                    <div className="flex items-center justify-end gap-2.5">
                      <span aria-hidden className="hidden h-1.5 w-14 flex-none rounded-r-[3px] bg-active md:block">
                        <span
                          className="block h-full rounded-r-[3px]"
                          style={{ width: `${Math.min(100, (c / maxCost) * 100)}%`, background: r.type === "usdc" ? "var(--accent)" : "var(--conv-2)" }}
                        />
                      </span>
                      <span className="w-14 text-right">{pct(r.all_in_cost_pct)}</span>
                    </div>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right tabular" title={durationRange(r.duration)}>
                    {minutes(r.duration.typical)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="border-t border-border sm:hidden">
        {visible.map((r) => (
          <li key={r.id} className="border-b border-rule last:border-0">
            <button onClick={() => onOpen(r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left text-[13px] transition hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Dot tone={routeTone(r)} />
                  <span className="truncate font-medium">{shortName(r)}</span>
                  {tag(r)}
                </span>
                <span className="block truncate pl-3.5 text-xs text-muted">{r.label.replace(/\s*\([^)]*\)/g, "")}</span>
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
