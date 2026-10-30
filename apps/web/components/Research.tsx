"use client";

import type { SensitivityResponse } from "@sim/contracts";
import { useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { minutes, money } from "@/lib/format";
import { Card, CardHeader, cn, Segmented, Skeleton } from "./ui";

/* One subject, one hue: USDC series take the data hue (solid = best, dashed = fastest); conventional
   comparators are ink (Wise) and grey (bank wire). Legend swatches are drawn from the same styles. */
const SERIES_STYLE: Record<string, { stroke: string; dash?: string }> = {
  best_usdc: { stroke: "var(--accent)" },
  fastest_usdc: { stroke: "var(--accent)", dash: "5 4" },
  wise: { stroke: "var(--conv)" },
  bank_swift: { stroke: "var(--conv-2)" },
};
const styleOf = (k: string) => SERIES_STYLE[k] ?? { stroke: "var(--conv-2)" };

/* Heatmap: each outcome has its own mark, so "faster only" reads apart from "cheaper only" without a second hue. */
const CLASS_STYLE: Record<string, { cls: string; label: string }> = {
  both: { cls: "bg-accent text-white", label: "USDC cheaper and faster" },
  cheaper: { cls: "bg-accent-soft text-accent-ink", label: "USDC cheaper only" },
  faster: { cls: "hatch text-accent-ink", label: "USDC faster only" },
  neither: { cls: "bg-active text-muted", label: "Conventional wins" },
  unavailable: { cls: "border border-dashed border-border-strong text-muted", label: "No comparison" },
};

export const AXIS_LABEL: Record<string, string> = {
  network_fee_multiplier: "Network fee ×",
  spread_bps: "Extra FX spread (bps)",
  depth_multiplier: "Book depth ×",
  payout_delay_hours: "Payout delay (h)",
  provider_fee_multiplier: "Provider fee ×",
};

function compact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function rowsOf(data: SensitivityResponse) {
  return data.amounts.map((a, i) => {
    const row: Record<string, number | string | null> = { amount: Number(a) };
    for (const s of data.series) {
      const p = s.points[i];
      row[`${s.key}_cost`] = p?.eligible && p.all_in_cost_pct != null ? Number(p.all_in_cost_pct) : null;
      row[`${s.key}_time`] = p?.eligible && p.typical_minutes != null ? p.typical_minutes / 60 : null;
      row[`${s.key}_label`] = p?.label ?? null;
    }
    return row;
  });
}

/** Round, even ticks from zero (or below it) to one step above the maximum. */
function niceTicks(min: number, max: number) {
  const span = Math.max(max - Math.min(0, min), 0.01);
  const step = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].find((s) => span / s <= 5) ?? 100;
  const lo = Math.min(0, Math.floor(min / step) * step);
  const hi = (Math.floor(max / step) + 1) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

/** Scale the cost chart to the comparison that matters: a series more than three times costlier than the
    next one (the bank wire at small amounts) runs off the top and is named in a caption instead. */
function costScale(rows: Record<string, number | string | null>[], data: SensitivityResponse) {
  const maxOf = (k: string) => Math.max(...rows.map((r) => (r[`${k}_cost`] as number | null) ?? -Infinity));
  const minAll = Math.min(...data.series.flatMap((s) => rows.map((r) => (r[`${s.key}_cost`] as number | null) ?? Infinity)));
  const maxima = data.series.map((s) => ({ s, m: maxOf(s.key) })).filter((x) => Number.isFinite(x.m)).sort((a, b) => b.m - a.m);
  const capped = maxima.length > 1 && maxima[0].m > 3 * Math.max(maxima[1].m, 0.5) ? maxima[0] : null;
  const top = capped ? maxima[1].m : (maxima[0]?.m ?? 1);
  const ticks = niceTicks(Number.isFinite(minAll) ? minAll : 0, top);
  return { ticks, capped: capped && capped.m > ticks[ticks.length - 1] ? capped : null };
}

const axis = { stroke: "var(--faint)", fontSize: 12, tickLine: false, axisLine: false } as const;

export function SeriesLegend({ data }: { data: SensitivityResponse }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {data.series.map((s) => {
        const st = styleOf(s.key);
        return (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <svg aria-hidden width="16" height="6">
              <line x1="0" y1="3" x2="16" y2="3" stroke={st.stroke} strokeWidth="2" strokeDasharray={st.dash} />
            </svg>
            {s.label}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ cost by amount (beside the answer) */

export function CostPanel({
  data,
  currency,
  amount,
  loading,
  error,
}: {
  data: SensitivityResponse | null;
  currency: string;
  amount: string;
  loading: boolean;
  error: string | null;
}) {
  const head = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-base font-semibold">All-in cost by amount</h2>
        <p className="mt-1 text-[13px] text-muted">Percent lost against the ECB mid-rate. Every point re-prices every route.</p>
      </div>
      {loading && <span className="text-xs text-muted">Sweeping…</span>}
    </div>
  );
  if (error && !data)
    return (
      <div>
        {head}
        <p className="mt-6 rounded-md border border-dashed border-border-strong px-3 py-2.5 text-[13px] text-muted">Couldn&apos;t run the amount sweep: {error}</p>
      </div>
    );
  if (!data)
    return (
      <div aria-busy>
        {head}
        <Skeleton className="mt-4 h-4 w-72" />
        <Skeleton className="mt-4 h-[260px] w-full" />
        <Skeleton className="mt-4 h-10 w-full" />
      </div>
    );

  const rows = rowsOf(data);
  const costX = data.crossovers.filter((c) => c.metric === "cost");
  const { ticks, capped } = costScale(rows, data);
  const a = Number(amount);
  const inRange = a >= Number(data.amounts[0]) && a <= Number(data.amounts[data.amounts.length - 1]);

  return (
    <div className={cn("flex h-full flex-col", loading && "opacity-60 transition")}>
      {head}
      <div className="mt-3">
        <SeriesLegend data={data} />
      </div>
      <figure className="mt-3 h-[260px]" aria-label="All-in cost by amount, log scale">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="amount" type="number" scale="log" domain={["dataMin", "dataMax"]} tickFormatter={compact} {...axis} allowDataOverflow />
            <YAxis {...axis} tickFormatter={(v) => `${v}%`} width={48} ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} allowDataOverflow />
            <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<Tip rows={rows} metric="cost" currency={currency} series={data.series} />} />
            <ReferenceLine y={0} stroke="var(--faint)" />
            {costX.map((c, i) => (
              <ReferenceLine key={i} x={Number(c.amount)} stroke="var(--faint)" strokeDasharray="3 3" />
            ))}
            {inRange && (
              <ReferenceLine x={a} stroke="var(--text)" label={{ value: `Your amount`, fontSize: 12, fill: "var(--text)", position: "top" }} />
            )}
            {data.series.map((s) => (
              <Line key={s.key} dataKey={`${s.key}_cost`} name={s.label} stroke={styleOf(s.key).stroke} strokeDasharray={styleOf(s.key).dash} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </figure>
      <p className="mt-1 text-right text-xs text-muted">Amount sent ({currency}), log scale</p>
      {capped && (
        <p className="mt-1 text-xs text-muted">
          {capped.s.label} runs off the top: up to {capped.m.toFixed(1)}% at small amounts (see the table view below).
        </p>
      )}
      <Crossovers data={data} currency={currency} />
    </div>
  );
}

function Crossovers({ data, currency }: { data: SensitivityResponse; currency: string }) {
  return (
    <div className="mt-4 border-t border-rule pt-4">
      <h3 className="text-sm font-semibold">Break-even amounts</h3>
      {data.crossovers.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted">{data.no_crossover_note}</p>
      ) : (
        <ul className="mt-1">
          {data.crossovers.map((c, i) => (
            <li key={i} className="flex items-baseline gap-4 border-b border-rule py-2 text-[13px] last:border-0">
              <span className="w-28 flex-none text-right text-sm font-medium tabular">{money(c.amount, currency, { dp: 0 })}</span>
              <span className="text-muted">
                <span className="text-text">{c.metric === "cost" ? "Cost" : "Time"}:</span> {c.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ time + stress (research card) */

export function ResearchCharts({ data, currency, controls }: { data: SensitivityResponse; currency: string; controls?: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = rowsOf(data);
  const timeX = data.crossovers.filter((c) => c.metric === "time");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Typical time to recipient bank</h3>
            <p className="mt-0.5 text-[13px] text-muted">Hours, by amount sent ({currency}, log scale)</p>
          </div>
          <Segmented label="Chart or table" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
        </div>
        {view === "chart" ? (
          <>
            <div className="mt-3">
              <SeriesLegend data={data} />
            </div>
            <figure className="mt-3 h-[240px]" aria-label="Typical time to recipient bank by amount">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="amount" type="number" scale="log" domain={["dataMin", "dataMax"]} tickFormatter={compact} {...axis} />
                  <YAxis {...axis} width={48} tickFormatter={(v) => `${v} h`} />
                  <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<Tip rows={rows} metric="time" currency={currency} series={data.series} />} />
                  {timeX.map((c, i) => (
                    <ReferenceLine key={i} x={Number(c.amount)} stroke="var(--faint)" strokeDasharray="3 3" />
                  ))}
                  {data.series.map((s) => (
                    <Line key={s.key} dataKey={`${s.key}_time`} name={s.label} stroke={styleOf(s.key).stroke} strokeDasharray={styleOf(s.key).dash} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} type="stepAfter" />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </>
        ) : (
          <div className="mt-3 max-h-[300px] overflow-auto">
            <table className="w-full text-[13px] tabular">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-xs text-muted">
                  <th className="h-9 pr-3 text-right font-normal">Amount</th>
                  {data.series.map((s) => (
                    <th key={s.key} className="h-9 px-2 text-right font-normal">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.amounts.map((a, i) => (
                  <tr key={a} className="border-b border-rule last:border-0">
                    <td className="py-1.5 pr-3 text-right">{Number(a).toLocaleString()}</td>
                    {data.series.map((s) => {
                      const p = s.points[i];
                      return (
                        <td key={s.key} className="px-2 py-1.5 text-right" title={p.label ?? ""}>
                          {p.eligible ? (
                            <>
                              {Number(p.all_in_cost_pct).toFixed(3)}%<span className="block text-xs text-muted">{minutes(p.typical_minutes)}</span>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Stress test: where does USDC still win?</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Best USDC route against best conventional route, with every route re-priced in each cell.
        </p>
        {controls && <div className="mt-4">{controls}</div>}
        {data.heatmap_axis && data.heatmap.length > 0 ? (
          <Heatmap data={data} currency={currency} />
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-border-strong px-3 py-2.5 text-[13px] text-muted">No stress grid for this sweep.</p>
        )}
      </div>

      <p className="text-xs text-muted xl:col-span-2">
        Simulation on one snapshot · <span className="tabular">{data.points_computed}</span> full re-pricings · <span className="font-mono">{data.snapshot.id}</span>
      </p>
    </div>
  );
}

type TipProps = {
  active?: boolean;
  label?: number;
  rows: Record<string, number | string | null>[];
  metric: "cost" | "time";
  currency: string;
  series: SensitivityResponse["series"];
};

function Tip({ active, label, rows, metric, currency, series }: TipProps) {
  if (!active || label == null) return null;
  const row = rows.find((r) => r.amount === label);
  if (!row) return null;
  return (
    <div className="max-w-xs rounded-md border border-border bg-surface p-3 text-xs shadow-lg">
      <div className="mb-1.5 text-[13px] font-semibold tabular">{money(String(label), currency)}</div>
      {series.map((s) => {
        const v = row[`${s.key}_${metric}`] as number | null;
        return (
          <div key={s.key} className="mb-1 flex items-baseline justify-between gap-4">
            <span className="text-muted">{s.label}</span>
            <span className="font-medium tabular">{v == null ? "—" : metric === "cost" ? `${v.toFixed(3)}%` : minutes(Math.round(v * 60))}</span>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ data, currency }: { data: SensitivityResponse; currency: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const cell = (a: string, v: string) => data.heatmap.find((c) => c.amount === a && c.axis_value === v);
  const hovered = hover ? data.heatmap.find((c) => `${c.amount}|${c.axis_value}` === hover) : null;
  const present = new Set(data.heatmap.map((c) => c.classification));
  return (
    <figure className="mt-4">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {Object.entries(CLASS_STYLE)
          .filter(([k]) => present.has(k as never))
          .map(([k, s]) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("inline-block h-3 w-4 rounded-sm", s.cls)} />
              {s.label}
            </li>
          ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-xs tabular" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="pr-2 text-left font-normal text-muted">{AXIS_LABEL[data.heatmap_axis!]}</th>
              {data.heatmap_amounts.map((a) => (
                <th key={a} className="font-normal text-muted">{compact(Number(a))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.heatmap_values.map((v) => (
              <tr key={v}>
                <th className="pr-2 text-left font-normal text-muted">{v}</th>
                {data.heatmap_amounts.map((a) => {
                  const c = cell(a, v);
                  const k = c?.classification ?? "unavailable";
                  const s = CLASS_STYLE[k];
                  const key = `${a}|${v}`;
                  return (
                    <td key={a} className="p-0">
                      <button
                        onMouseEnter={() => setHover(key)}
                        onFocus={() => setHover(key)}
                        aria-label={`${compact(Number(a))} ${currency}, ${AXIS_LABEL[data.heatmap_axis!]} ${v}: ${s.label}`}
                        className={cn(
                          "flex h-9 w-16 items-center justify-center rounded text-xs font-medium transition",
                          s.cls,
                          hover === key && "outline outline-2 outline-offset-1 outline-[var(--text)]",
                        )}
                      >
                        {k === "unavailable" ? "—" : c?.cost_advantage_pct != null ? `${Number(c.cost_advantage_pct) >= 0 ? "+" : ""}${Number(c.cost_advantage_pct).toFixed(2)}` : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-3 min-h-10 text-[13px] leading-5 text-muted">
        {hovered ? (
          <>
            <span className="font-medium text-text">{money(hovered.amount, currency)}</span> at {AXIS_LABEL[data.heatmap_axis!]} {hovered.axis_value}:{" "}
            {CLASS_STYLE[hovered.classification].label}. Cost advantage {hovered.cost_advantage_pct ?? "—"} pp; time advantage{" "}
            {hovered.time_advantage_minutes == null ? "unknown" : minutes(Math.abs(hovered.time_advantage_minutes)) + (hovered.time_advantage_minutes >= 0 ? " faster" : " slower")}.
          </>
        ) : (
          "Cell figures are USDC's cost advantage in percentage points (positive means USDC is cheaper). Hover or focus a cell for details."
        )}
      </figcaption>
    </figure>
  );
}

export function ResearchCard({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Card aria-labelledby="research-title">
      <CardHeader
        id="research-title"
        title="When does USDC win?"
        sub="Time by amount, and how far the advantage survives congestion, thin books, wider spreads and delays."
        right={right}
      />
      <div className="px-5 pb-5 pt-1">{children}</div>
    </Card>
  );
}
