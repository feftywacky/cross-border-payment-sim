"use client";

import type { SensitivityResponse } from "@sim/contracts";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { minutes, money, pct } from "@/lib/format";
import { Card, CardHeader, cn, Disclosure, Segmented } from "./ui";

// Validated categorical slots (dataviz reference palette), fixed per entity — never by rank.
const SERIES_COLOR: Record<string, string> = {
  best_usdc: "var(--viz-1)",
  wise: "var(--viz-2)",
  fastest_usdc: "var(--viz-3)",
  bank_swift: "var(--viz-4)",
};
const CLASS_STYLE: Record<string, { bg: string; label: string }> = {
  cheaper: { bg: "var(--viz-1)", label: "USDC cheaper" },
  faster: { bg: "var(--viz-2)", label: "USDC faster" },
  both: { bg: "var(--viz-3)", label: "Both" },
  neither: { bg: "var(--viz-neutral)", label: "Neither" },
  unavailable: { bg: "transparent", label: "No comparison" },
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

export function ResearchCharts({ data, currency, controls }: { data: SensitivityResponse; currency: string; controls?: React.ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = data.amounts.map((a, i) => {
    const row: Record<string, number | string | null> = { amount: Number(a) };
    for (const s of data.series) {
      const p = s.points[i];
      row[`${s.key}_cost`] = p?.eligible && p.all_in_cost_pct != null ? Number(p.all_in_cost_pct) : null;
      row[`${s.key}_time`] = p?.eligible && p.typical_minutes != null ? p.typical_minutes / 60 : null;
      row[`${s.key}_label`] = p?.label ?? null;
    }
    return row;
  });
  const costX = data.crossovers.filter((c) => c.metric === "cost");
  const timeX = data.crossovers.filter((c) => c.metric === "time");
  const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

  return (
    <div className="viz-root flex flex-col gap-6">
      <div>
        <div className="eyebrow">Break-even</div>
        {data.crossovers.length === 0 ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{data.no_crossover_note}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.crossovers.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="display text-2xl tabular">{money(c.amount, currency, { dp: 0 })}</span>
                <span className="text-muted">
                  <span className="text-text">{c.metric}</span> · {c.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {data.series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES_COLOR[s.key] }} />
              {s.label}
            </span>
          ))}
        </div>
        <Segmented label="Chart or table" value={view} onChange={setView} options={[{ value: "chart", label: "Charts" }, { value: "table", label: "Table" }]} />
      </div>

      {view === "chart" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <ChartBox title="All-in cost" sub="% lost vs ECB reference, by amount (log)">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="amount" type="number" scale="log" domain={["dataMin", "dataMax"]} tickFormatter={compact} {...axis} allowDataOverflow />
              <YAxis {...axis} tickFormatter={(v) => `${v}%`} domain={[(min: number) => Math.min(0, Math.floor(min)), (max: number) => Math.min(Math.ceil(max), 15)]} allowDataOverflow />
              <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<Tip rows={rows} metric="cost" currency={currency} series={data.series} />} />
              {costX.map((c, i) => (
                <ReferenceLine key={i} x={Number(c.amount)} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: compact(Number(c.amount)), fontSize: 10, fill: "var(--muted)", position: "insideTopRight" }} />
              ))}
              {data.series.map((s) => (
                <Line key={s.key} dataKey={`${s.key}_cost`} name={s.label} stroke={SERIES_COLOR[s.key]} strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ChartBox>
          <ChartBox title="Typical time" sub="hours to recipient bank, by amount (log)">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="amount" type="number" scale="log" domain={["dataMin", "dataMax"]} tickFormatter={compact} {...axis} />
              <YAxis {...axis} tickFormatter={(v) => `${v}h`} />
              <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<Tip rows={rows} metric="time" currency={currency} series={data.series} />} />
              {timeX.map((c, i) => (
                <ReferenceLine key={i} x={Number(c.amount)} stroke="var(--muted)" strokeDasharray="3 3" />
              ))}
              {data.series.map((s) => (
                <Line key={s.key} dataKey={`${s.key}_time`} name={s.label} stroke={SERIES_COLOR[s.key]} strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} type="stepAfter" />
              ))}
            </LineChart>
          </ChartBox>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead className="text-left text-faint">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Amount ({currency})</th>
                {data.series.map((s) => (
                  <th key={s.key} className="px-3 py-2 font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.amounts.map((a, i) => (
                <tr key={a} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3">{Number(a).toLocaleString()}</td>
                  {data.series.map((s) => {
                    const p = s.points[i];
                    return (
                      <td key={s.key} className="px-3 py-1.5" title={p.label ?? ""}>
                        {p.eligible ? `${pct(p.all_in_cost_pct, 3)} · ${minutes(p.typical_minutes)}` : <span className="text-faint">unavailable</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(controls || (data.heatmap_axis && data.heatmap.length > 0)) && (
        <Disclosure summary="Stress test — where does USDC still win?" className="border-t border-border pt-5">
          {controls && <div className="mb-4">{controls}</div>}
          {data.heatmap_axis && data.heatmap.length > 0 && <Heatmap data={data} currency={currency} />}
        </Disclosure>
      )}

      <p className="text-[11px] text-faint">
        Simulation on one snapshot · {data.points_computed} full re-pricings · <span className="font-mono">{data.snapshot.id}</span>
      </p>
    </div>
  );
}

function ChartBox({ title, sub, children }: { title: string; sub: string; children: React.ReactElement }) {
  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline gap-2">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-[11px] text-faint">{sub}</span>
      </figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
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
    <div className="max-w-xs rounded-xl border border-border bg-surface p-3 text-[11px] shadow-soft">
      <div className="mb-1 font-semibold tabular">{money(String(label), currency)}</div>
      {series.map((s) => {
        const v = row[`${s.key}_${metric}`] as number | null;
        return (
          <div key={s.key} className="mb-0.5">
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLOR[s.key] }} />
            <span className="text-muted">{s.label}: </span>
            <b className="tabular">{v == null ? "unavailable" : metric === "cost" ? `${v.toFixed(3)}%` : minutes(Math.round(v * 60))}</b>
            {row[`${s.key}_label`] && <div className="truncate pl-3 text-muted">{String(row[`${s.key}_label`])}</div>}
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
  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-semibold">Where does the best USDC route beat the best conventional route?</div>
          <div className="text-[11px] text-muted">
            Rows: {AXIS_LABEL[data.heatmap_axis!]} · Columns: amount ({currency}) · each cell re-prices every route
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(CLASS_STYLE).map(([k, s]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cn("inline-block h-3 w-3 rounded-sm", k === "unavailable" && "border border-dashed border-muted")} style={{ background: s.bg }} />
              {s.label}
            </span>
          ))}
        </div>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[11px] tabular" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="px-1 text-left font-medium text-muted">{AXIS_LABEL[data.heatmap_axis!]}</th>
              {data.heatmap_amounts.map((a) => (
                <th key={a} className="px-1 font-medium text-muted">{compact(Number(a))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.heatmap_values.map((v) => (
              <tr key={v}>
                <th className="px-1 text-left font-medium text-muted">{v}</th>
                {data.heatmap_amounts.map((a) => {
                  const c = cell(a, v);
                  const s = CLASS_STYLE[c?.classification ?? "unavailable"];
                  const key = `${a}|${v}`;
                  return (
                    <td key={a} className="p-0">
                      <button
                        onMouseEnter={() => setHover(key)}
                        onFocus={() => setHover(key)}
                        aria-label={`${compact(Number(a))} ${currency}, ${AXIS_LABEL[data.heatmap_axis!]} ${v}: ${s.label}`}
                        className={cn(
                          "flex h-8 w-14 items-center justify-center rounded-md text-[10px] font-medium transition",
                          c?.classification === "unavailable" ? "border border-dashed border-border text-muted" : "text-[#0b0b0b]",
                          hover === key && "ring-2 ring-[var(--text)]",
                        )}
                        style={{ background: s.bg }}
                      >
                        {c?.classification === "unavailable" ? "—" : c?.cost_advantage_pct != null ? `${Number(c.cost_advantage_pct) >= 0 ? "+" : ""}${Number(c.cost_advantage_pct).toFixed(2)}` : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 min-h-8 text-[11px] text-muted">
        {hovered ? (
          <>
            <b className="text-text">{money(hovered.amount, currency)}</b> at {AXIS_LABEL[data.heatmap_axis!]} {hovered.axis_value}:{" "}
            {CLASS_STYLE[hovered.classification].label}. Cost advantage {hovered.cost_advantage_pct ?? "—"} pp; time advantage{" "}
            {hovered.time_advantage_minutes == null ? "unknown" : minutes(Math.abs(hovered.time_advantage_minutes)) + (hovered.time_advantage_minutes >= 0 ? " faster" : " slower")}.
            <span className="block font-mono">{hovered.best_usdc_route_id} vs {hovered.best_conventional_route_id}</span>
          </>
        ) : (
          "Cell text = all-in cost advantage of USDC in percentage points (positive = USDC cheaper). Hover or focus a cell for details."
        )}
      </p>
    </figure>
  );
}

export function ResearchCard({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title="When does USDC win?"
        sub="Every route is fully re-priced at each amount and stress point — never a linear scaling of one quote."
        right={right}
      />
      <div className="px-5 pb-5 pt-2">{children}</div>
    </Card>
  );
}
