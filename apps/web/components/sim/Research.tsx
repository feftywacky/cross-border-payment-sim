"use client";

import type { HeatmapCell, SensitivityRequest, SensitivityResponse } from "@sim/contracts";
import { useState, type ReactNode } from "react";
import { compact, dur, num } from "@/lib/format";
import { useWidth } from "./useWidth";
import { ChartTip, cn, FamilyMark, Panel, PanelHead, Seg, Skeleton, Spinner, type Family } from "../ui/kit";

export type Axis = NonNullable<SensitivityRequest["heatmap_axis"]>;

export const AXIS_LABEL: Record<Axis, string> = {
  network_fee_multiplier: "Chain congestion (× gas)",
  spread_bps: "Extra FX spread (bps)",
  depth_multiplier: "Book depth (×)",
  payout_delay_hours: "Payout delay (h)",
  provider_fee_multiplier: "Provider fee (×)",
};

/* Same entity → same colour as everywhere else; the fastest-USDC line is distinguished by dash, not a new hue. */
const SERIES: Record<string, { family: Family; dash?: string; short: string }> = {
  best_usdc: { family: "usdc", short: "Best USDC" },
  fastest_usdc: { family: "usdc", dash: "5 4", short: "Fastest USDC" },
  wise: { family: "wise", short: "Wise" },
  bank_swift: { family: "bank", short: "Bank wire" },
};

/* ------------------------------------------------------------------ sweep chart */

const H = 300;
const M = { t: 18, r: 96, b: 34, l: 48 };

function Sweep({ data, currency, amount }: { data: SensitivityResponse; currency: string; amount: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const xs = data.amounts.map(Number);
  const cost = (key: string, i: number) => {
    const p = data.series.find((s) => s.key === key)?.points[i];
    return p?.eligible && p.all_in_cost_pct != null ? Number(p.all_in_cost_pct) : null;
  };
  // y range follows the competitive series; the bank wire is clipped when it runs far above (marked at the edge).
  const core = data.series.filter((s) => s.key !== "bank_swift").flatMap((s) => s.points.map((p) => (p.eligible && p.all_in_cost_pct != null ? Number(p.all_in_cost_pct) : null)));
  const vals = core.filter((v): v is number => v != null);
  const yMax = Math.max(0.5, ...vals) * 1.15;
  const yMin = Math.min(0, ...vals);
  const W = Math.max(w, 360);
  const IW = W - M.l - M.r;
  const IH = H - M.t - M.b;
  const lx0 = Math.log10(xs[0]);
  const lx1 = Math.log10(xs[xs.length - 1]);
  const sx = (v: number) => M.l + ((Math.log10(v) - lx0) / (lx1 - lx0 || 1)) * IW;
  const sy = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin)) * IH;
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find((s) => (yMax - yMin) / s <= 6) ?? 20;
  const yTicks: number[] = [];
  for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) yTicks.push(Math.round(t * 100) / 100);
  const xTicks = xs.filter((_, i) => i % Math.ceil(xs.length / 7) === 0 || i === xs.length - 1);

  const path = (key: string) => {
    let d = "";
    let pen = false;
    xs.forEach((x, i) => {
      const v = cost(key, i);
      if (v == null) return void (pen = false);
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const lastIdx = (key: string) => {
    for (let i = xs.length - 1; i >= 0; i--) if (cost(key, i) != null) return i;
    return -1;
  };
  // Direct end labels with a minimum vertical gap.
  const ends = data.series
    .map((s) => ({ key: s.key, i: lastIdx(s.key) }))
    .filter((e) => e.i >= 0)
    .map((e) => ({ ...e, y: sy(Math.min(cost(e.key, e.i)!, yMax)) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

  const amt = Number(amount);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`All-in cost by transfer amount for ${data.series.map((s) => s.label).join(", ")}`}
        onMouseMove={(e) => {
          const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mx = e.clientX - b.left;
          let best = 0;
          xs.forEach((x, i) => Math.abs(sx(x) - mx) < Math.abs(sx(xs[best]) - mx) && (best = i));
          setHi(best);
        }}
      >
        <defs>
          <clipPath id="sweep-clip">
            <rect x={M.l} y={M.t - 2} width={IW} height={IH + 4} />
          </clipPath>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={M.l + IW} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} />
            <text x={M.l - 8} y={sy(t) + 3.5} textAnchor="end" className="fill-[var(--faint)] font-mono text-[10px]">
              {t}%
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={H - M.b + 16} textAnchor="middle" className="fill-[var(--faint)] font-mono text-[10px]">
            {compact(x)}
          </text>
        ))}
        <text x={M.l + IW} y={H - 4} textAnchor="end" className="fill-[var(--faint)] text-[10px]">
          amount sent, {currency}, log scale →
        </text>

        {data.crossovers.map((c) => (
          <g key={c.metric + c.amount}>
            <line x1={sx(Number(c.amount))} x2={sx(Number(c.amount))} y1={M.t} y2={M.t + IH} stroke="var(--text)" strokeDasharray="2 3" opacity={0.6} />
            <text x={sx(Number(c.amount)) + 5} y={M.t + 10} className="fill-[var(--text)] text-[10.5px] font-medium" paintOrder="stroke" stroke="var(--panel)" strokeWidth={3}>
              break-even on {c.metric} ≈ {compact(c.amount, 2)}
            </text>
          </g>
        ))}

        {amt >= xs[0] && amt <= xs[xs.length - 1] && (
          <g>
            <line x1={sx(amt)} x2={sx(amt)} y1={M.t} y2={M.t + IH} stroke="var(--usdc)" strokeWidth={1} opacity={0.5} />
            <text x={sx(amt)} y={M.t + IH - 6} textAnchor="middle" className="fill-[var(--usdc-ink)] font-mono text-[10px]" paintOrder="stroke" stroke="var(--panel)" strokeWidth={3}>
              you · {compact(amt)}
            </text>
          </g>
        )}

        <g clipPath="url(#sweep-clip)">
          {data.series.map((s) => {
            const st = SERIES[s.key] ?? { family: "bank" as Family };
            return <path key={s.key} d={path(s.key)} fill="none" stroke={`var(--${st.family})`} strokeWidth={2} strokeDasharray={st.dash} strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </g>
        {/* Off-scale markers for clipped values (bank wire at small amounts). */}
        {data.series.map((s) =>
          xs.map((x, i) => {
            const v = cost(s.key, i);
            return v != null && v > yMax ? <path key={s.key + i} d={`M${sx(x) - 3.5},${M.t + 3} L${sx(x) + 3.5},${M.t + 3} L${sx(x)},${M.t - 2}Z`} fill={`var(--${SERIES[s.key]?.family ?? "bank"})`} /> : null;
          }),
        )}

        {ends.map((e) => {
          const st = SERIES[e.key];
          return (
            <text key={e.key} x={M.l + IW + 8} y={e.y + 3.5} className="fill-[var(--text)] text-[10.5px]">
              {st?.short ?? e.key}
            </text>
          );
        })}

        {hi != null && (
          <g pointerEvents="none">
            <line x1={sx(xs[hi])} x2={sx(xs[hi])} y1={M.t} y2={M.t + IH} stroke="var(--muted)" strokeWidth={1} />
            {data.series.map((s) => {
              const v = cost(s.key, hi);
              return v == null || v > yMax ? null : <circle key={s.key} cx={sx(xs[hi])} cy={sy(v)} r={4} fill={`var(--${SERIES[s.key]?.family ?? "bank"})`} stroke="var(--panel)" strokeWidth={2} />;
            })}
          </g>
        )}
      </svg>
      {hi != null && (
        <ChartTip x={sx(xs[hi])} y={M.t + 20} w={W}>
          <div className="num font-medium">
            {num(xs[hi], 0)} {currency}
          </div>
          <table className="mt-1.5 w-full">
            <tbody>
              {data.series.map((s) => {
                const p = s.points[hi];
                return (
                  <tr key={s.key}>
                    <td className="py-0.5 pr-3">
                      <span className="flex items-center gap-1.5 text-muted">
                        <FamilyMark family={SERIES[s.key]?.family ?? "bank"} size={8} />
                        {SERIES[s.key]?.short ?? s.label}
                      </span>
                    </td>
                    <td className="num py-0.5 pr-3 text-right">{p?.eligible ? `${num(p.all_in_cost_pct, 2)}%` : "—"}</td>
                    <td className="num py-0.5 text-right text-faint">{p?.eligible ? dur(p.typical_minutes) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ChartTip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ heatmap */

function cellTone(c: HeatmapCell) {
  if (c.classification === "unavailable" || c.cost_advantage_pct == null) return { bg: "", hatch: true };
  const v = Number(c.cost_advantage_pct);
  const k = Math.abs(v) >= 1 ? 3 : Math.abs(v) >= 0.25 ? 2 : Math.abs(v) >= 0.02 ? 1 : 0;
  if (k === 0) return { bg: "var(--div-mid)", hatch: false, strong: false };
  return { bg: `var(--div-${v > 0 ? "pos" : "neg"}-${k})`, hatch: false, strong: k === 3 };
}

const CLASS_TEXT: Record<HeatmapCell["classification"], string> = {
  both: "USDC cheaper and faster",
  cheaper: "USDC cheaper, conventional faster",
  faster: "USDC faster, conventional cheaper",
  neither: "Conventional cheaper and faster",
  unavailable: "No comparison",
};

function Heatmap({ data, currency }: { data: SensitivityResponse; currency: string }) {
  const cell = (a: string, v: string) => data.heatmap.find((c) => c.amount === a && c.axis_value === v);
  const axis = data.heatmap_axis as Axis | null;
  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-center">
          <caption className="sr-only">USDC cost advantage in percentage points by amount and {axis ? AXIS_LABEL[axis] : "stress"}</caption>
          <thead>
            <tr>
              <th className="eyebrow w-28 pr-2 text-right font-normal">{axis ? AXIS_LABEL[axis].replace(/ \(.*\)/, "") : ""} ↓ · amount →</th>
              {data.heatmap_amounts.map((a) => (
                <th key={a} scope="col" className="num pb-1 text-[10.5px] font-normal text-faint">
                  {compact(a)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.heatmap_values.map((v) => (
              <tr key={v}>
                <th scope="row" className="num pr-2 text-right text-[11px] font-normal text-muted">
                  {v}
                  {axis?.endsWith("multiplier") ? "×" : axis === "spread_bps" ? " bp" : axis === "payout_delay_hours" ? " h" : ""}
                </th>
                {data.heatmap_amounts.map((a) => {
                  const c = cell(a, v);
                  if (!c) return <td key={a} className="hatch h-9 rounded" />;
                  const t = cellTone(c);
                  const faster = (c.time_advantage_minutes ?? 0) > 0;
                  const title = `${num(a, 0)} ${currency} at ${v}: ${CLASS_TEXT[c.classification]}. Cost advantage ${c.cost_advantage_pct ?? "—"} pp; time ${c.time_advantage_minutes != null ? `${c.time_advantage_minutes > 0 ? "USDC " : "conventional "}${dur(Math.abs(c.time_advantage_minutes))} faster` : "—"}.`;
                  return (
                    <td
                      key={a}
                      title={title}
                      aria-label={title}
                      className={cn("num h-9 rounded text-[10.5px] transition hover:outline hover:outline-1 hover:outline-[var(--text)]", t.hatch && "hatch", t.strong ? "text-white" : "text-text")}
                      style={{ background: t.hatch ? undefined : t.bg }}
                    >
                      {c.cost_advantage_pct != null ? num(c.cost_advantage_pct, 2, true) : "—"}
                      {faster && <span className="ml-0.5" aria-hidden>⚡</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
        <span>Cost advantage, percentage points:</span>
        <span className="flex items-center gap-[2px]">
          <span className="mr-1">conventional cheaper</span>
          {["neg-3", "neg-2", "neg-1", "mid", "pos-1", "pos-2", "pos-3"].map((k) => (
            <span key={k} className="h-3 w-5 rounded-sm" style={{ background: `var(--div-${k})` }} />
          ))}
          <span className="ml-1">USDC cheaper</span>
        </span>
        <span>⚡ USDC also faster</span>
        <span className="flex items-center gap-1">
          <span className="hatch inline-block h-3 w-5 rounded-sm border border-line" /> no comparison
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

export function Research({
  data,
  loading,
  error,
  currency,
  amount,
  controls,
}: {
  data: SensitivityResponse | null;
  loading: boolean;
  error: string | null;
  currency: string;
  amount: string;
  controls?: ReactNode;
}) {
  const [view, setView] = useState<"sweep" | "stress">("sweep");
  return (
    <Panel aria-labelledby="research-h">
      <PanelHead
        id="research-h"
        title="When does USDC win?"
        sub="Re-prices the best route of each family across transfer sizes, then stresses one market condition. All points come from one data snapshot."
        right={
          <>
            {loading && <Spinner label="Sweeping…" />}
            <Seg
              label="Research view"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "sweep", label: "Size sweep" },
                { value: "stress", label: "Stress test" },
              ]}
            />
          </>
        }
      />
      {controls && <div className="px-4 pb-3">{controls}</div>}
      <div className={cn("px-4 pb-4 transition", loading && data && "opacity-50")}>
        {error && <p className="text-[13px] text-down">Sweep failed: {error}</p>}
        {!data && !error && <Skeleton className="h-[300px] w-full" />}
        {data && view === "sweep" && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {data.crossovers.map((c) => (
                <p key={c.metric + c.amount} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] leading-[17px]">
                  <span className="eyebrow mr-2 text-text">break-even on {c.metric}</span>
                  <span className="num font-medium">
                    ≈ {num(c.amount, 0)} {currency}
                  </span>
                  <span className="mt-0.5 block text-muted">{c.description}</span>
                </p>
              ))}
              {!data.crossovers.length && data.no_crossover_note && <p className="text-[12px] text-muted">{data.no_crossover_note}</p>}
            </div>
            <Sweep data={data} currency={currency} amount={amount} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              {data.series.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <svg aria-hidden width="18" height="6">
                    <line x1="1" x2="17" y1="3" y2="3" stroke={`var(--${SERIES[s.key]?.family ?? "bank"})`} strokeWidth="2" strokeDasharray={SERIES[s.key]?.dash} />
                  </svg>
                  {s.label}
                </span>
              ))}
              <span className="text-faint">▲ at the top edge: off scale</span>
            </div>
          </>
        )}
        {data && view === "stress" && <Heatmap data={data} currency={currency} />}
        {data && <p className="mt-3 text-[11px] text-faint">{data.points_computed} points computed · {data.disclaimer}</p>}
      </div>
    </Panel>
  );
}
