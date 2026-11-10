"use client";

import type { ComparisonResponse, RouteResult } from "@sim/contracts";
import { useMemo, useState } from "react";
import { FAMILY_LABEL, familyOf, received, timeOf, type TimeBasis } from "@/lib/derive";
import { dur, num } from "@/lib/format";
import { useWidth } from "./useWidth";
import { ChartTip, FamilyMark, Panel, PanelHead, type Family } from "../ui/kit";

const H = 300;
const M = { t: 16, r: 18, b: 34, l: 64 };
const TICKS = [10, 30, 60, 180, 360, 720, 1440, 2880, 5760, 10080];

function Mark({ family, x, y, r = 4.5, ring }: { family: Family; x: number; y: number; r?: number; ring?: boolean }) {
  const fill = `var(--${family})`;
  const common = { fill, stroke: ring ? "var(--text)" : "var(--panel)", strokeWidth: ring ? 1.5 : 2 };
  if (family === "wise") return <path d={`M${x},${y - r - 1.5} L${x + r + 1.5},${y} L${x},${y + r + 1.5} L${x - r - 1.5},${y}Z`} {...common} />;
  if (family === "bank") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

export function Frontier({ data, highlight, onOpen }: { data: ComparisonResponse; highlight: Set<string> | null; onOpen: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<RouteResult | null>(null);
  const ccy = data.request.destination_currency;
  const dp = ccy === "JPY" ? 0 : 2;
  const basis: TimeBasis = data.request.time_basis ?? "END_TO_END";
  const T = (r: RouteResult) => timeOf(r, basis);

  const pts = useMemo(() => data.routes.filter((r) => r.eligible && r.recipient_amount != null && T(r).known && T(r).typical != null), [data, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const unknownTime = data.routes.filter((r) => r.eligible && !T(r).known).length;

  if (!pts.length) return null;

  // y domain: the competitive cluster (everything except the bank wire). Points far below are pinned to the floor.
  const core = pts.filter((r) => r.type !== "bank_wire").map((r) => received(r)!);
  const all = pts.map((r) => received(r)!);
  const cLo = Math.min(...(core.length ? core : all));
  const cHi = Math.max(...all);
  const pad = Math.max((cHi - cLo) * 0.1, cHi * 0.0005);
  const yLo = cLo - pad;
  const yHi = cHi + pad;
  const times = pts.map((r) => Math.max(1, T(r).typical!));
  const xLo = Math.log10(Math.min(...times) / 1.6);
  const xHi = Math.log10(Math.max(...times) * 1.6);

  const IW = Math.max(w, 320) - M.l - M.r;
  const IH = H - M.t - M.b;
  const sx = (m: number) => M.l + ((Math.log10(Math.max(1, m)) - xLo) / (xHi - xLo)) * IW;
  const sy = (v: number) => M.t + (1 - (Math.max(v, yLo) - yLo) / (yHi - yLo)) * IH;
  const yTicks = niceTicks(yLo, yHi, 5);
  const xTicks = TICKS.filter((t) => Math.log10(t) >= xLo && Math.log10(t) <= xHi);

  const pareto = data.pareto_route_ids
    .map((id) => pts.find((r) => r.id === id))
    .filter((r): r is RouteResult => !!r)
    .sort((a, b) => T(a).typical! - T(b).typical!);
  // Step frontier: from each frontier point hold its amount until the next (slower, richer) point.
  const step = pareto.map((r, i) => {
    const x = sx(T(r).typical!);
    const y = sy(received(r)!);
    if (i === 0) return `M${x},${y}`;
    const prevY = sy(received(pareto[i - 1])!);
    return `L${x},${prevY} L${x},${y}`;
  });

  const labelled = new Map<string, string>();
  const rec = data.recommended_route_id;
  if (rec) labelled.set(rec, "Recommended");
  if (data.fastest_route_id && data.fastest_route_id !== rec) labelled.set(data.fastest_route_id, "Fastest");
  for (const r of pts) if (r.type !== "usdc") labelled.set(r.id, FAMILY_LABEL[familyOf(r)]);

  // Draw USDC first, then conventional on top; highlighted last.
  const order = [...pts].sort((a, b) => Number(a.type !== "usdc") - Number(b.type !== "usdc") || Number(!!highlight?.has(a.id)) - Number(!!highlight?.has(b.id)));

  const nearest = (mx: number, my: number) => {
    let best: RouteResult | null = null;
    let d = 16 * 16;
    for (const r of pts) {
      const dx = sx(T(r).typical!) - mx;
      const dy = sy(received(r)!) - my;
      const dd = dx * dx + dy * dy;
      if (dd < d) [d, best] = [dd, r];
    }
    return best;
  };

  return (
    <Panel aria-labelledby="fr-h">
      <PanelHead
        id="fr-h"
        title="Cost × speed frontier"
        sub={
          <>
            Each mark is one priced route: up is more money, left is faster. The stepped line is the Pareto frontier, where no other route is both
            faster and cheaper.{unknownTime > 0 && ` ${unknownTime} route(s) with unknown timing are not plotted.`}
          </>
        }
        right={
          <div className="flex items-center gap-3 text-[11px] text-muted">
            {(["usdc", "wise", "bank"] as Family[]).map((f) => (
              <span key={f} className="flex items-center gap-1.5">
                <FamilyMark family={f} size={9} /> {FAMILY_LABEL[f]}
              </span>
            ))}
          </div>
        }
      />
      <div ref={ref} className="relative px-1 pb-2" onMouseLeave={() => setHover(null)}>
        <svg
          width={Math.max(w, 320)}
          height={H}
          role="img"
          aria-label="Scatter of recipient amount against typical completion time"
          onMouseMove={(e) => {
            const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setHover(nearest(e.clientX - b.left, e.clientY - b.top));
          }}
          onClick={() => hover && onOpen(hover.id)}
          className={hover ? "cursor-pointer" : undefined}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={M.l + IW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
              <text x={M.l - 8} y={sy(t) + 3.5} textAnchor="end" className="fill-[var(--faint)] font-mono text-[10px]">
                {num(t, t >= 1000 ? 0 : dp)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + IH} stroke="var(--grid)" />
              <text x={sx(t)} y={H - M.b + 16} textAnchor="middle" className="fill-[var(--faint)] font-mono text-[10px]">
                {dur(t)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + IW} y1={M.t + IH} y2={M.t + IH} stroke="var(--axis)" />
          <text x={M.l + IW} y={H - 4} textAnchor="end" className="fill-[var(--faint)] text-[10px]">
            typical time, log scale →
          </text>
          <text x={12} y={M.t + 2} className="fill-[var(--faint)] text-[10px]" transform={`rotate(-90 12 ${M.t + 2})`} textAnchor="end">
            received {ccy} →
          </text>

          {step.length > 1 && <path d={step.join(" ")} fill="none" stroke="var(--usdc)" strokeWidth={2} strokeDasharray="4 3" opacity={0.7} />}

          {hover && T(hover).min != null && T(hover).max != null && (
            <g>
              <line x1={sx(T(hover).min!)} x2={sx(T(hover).max!)} y1={sy(received(hover)!)} y2={sy(received(hover)!)} stroke="var(--muted)" strokeWidth={1.5} />
              {[T(hover).min!, T(hover).max!].map((m, i) => (
                <line key={i} x1={sx(m)} x2={sx(m)} y1={sy(received(hover)!) - 4} y2={sy(received(hover)!) + 4} stroke="var(--muted)" strokeWidth={1.5} />
              ))}
            </g>
          )}

          {order.map((r) => {
            const v = received(r)!;
            const pinned = v < yLo;
            const x = sx(T(r).typical!);
            const y = sy(v);
            const dim = highlight && !highlight.has(r.id);
            return (
              <g key={r.id} opacity={dim ? 0.15 : r.type === "usdc" && !data.pareto_route_ids.includes(r.id) && hover?.id !== r.id ? 0.8 : 1}>
                <Mark family={familyOf(r)} x={x} y={pinned ? y - 6 : y} r={hover?.id === r.id ? 6 : r.type === "usdc" ? 4 : 5.5} ring={hover?.id === r.id} />
                {pinned && <path d={`M${x - 3.5},${y - 1} L${x + 3.5},${y - 1} L${x},${y + 3}Z`} fill="var(--muted)" />}
              </g>
            );
          })}

          {placeLabels([...labelled].flatMap(([id, text]) => {
            const r = pts.find((p) => p.id === id);
            if (!r) return [];
            const v = received(r)!;
            const pinned = v < yLo;
            const x = sx(T(r).typical!);
            const y = sy(v) - (pinned ? 6 : 0);
            return [{ id, text, x, y, pinned, v, right: x < M.l + IW * 0.75 }];
          })).map((l) => (
            <text
              key={l.id}
              pointerEvents="none"
              x={l.right ? l.x + 10 : l.x - 10}
              y={l.ly}
              textAnchor={l.right ? "start" : "end"}
              className="fill-[var(--text)] text-[11px] font-medium"
              paintOrder="stroke"
              stroke="var(--panel)"
              strokeWidth={3}
            >
              {l.text}
              {l.pinned && <tspan className="fill-[var(--faint)] font-mono text-[10px]"> {num(l.v, dp)} ↓ off scale</tspan>}
            </text>
          ))}
        </svg>
        {hover && (
          <ChartTip x={sx(T(hover).typical!)} y={sy(received(hover)!)} w={Math.max(w, 320)}>
            <div className="flex items-center gap-1.5 font-medium">
              <FamilyMark family={familyOf(hover)} size={8} />
              <span className="max-w-60 truncate">{hover.type === "usdc" ? hover.provider_steps.join(" → ") : hover.label}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-muted">
              <span>Received</span>
              <span className="num text-right text-text">
                {num(hover.recipient_amount, dp)} {ccy}
              </span>
              <span>All-in cost</span>
              <span className="num text-right text-text">{num(hover.all_in_cost_pct, 2)}%</span>
              <span>Typical</span>
              <span className="num text-right text-text">{dur(T(hover).typical)}</span>
              <span>Range</span>
              <span className="num text-right">
                {dur(T(hover).min)}–{dur(T(hover).max)}
              </span>
            </div>
            <div className="mt-1.5 text-[10.5px] text-faint">Click to trace</div>
          </ChartTip>
        )}
      </div>
    </Panel>
  );
}

function niceTicks(lo: number, hi: number, n: number) {
  const span = hi - lo;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(Math.round(t / step) * step);
  return out;
}

/** Greedy label placement: above the mark first, then below, then further out, skipping slots that overlap a placed label. */
function placeLabels<T extends { x: number; y: number; right: boolean; text: string }>(items: T[]) {
  const placed: { x0: number; x1: number; y: number }[] = [];
  return items.map((it) => {
    const w = it.text.length * 6.5 + 8;
    const x0 = it.right ? it.x + 10 : it.x - 10 - w;
    const x1 = x0 + w;
    const slots = [it.y - 8, it.y + 16, it.y - 22, it.y + 30, it.y - 36];
    const ly = slots.find((y) => !placed.some((p) => Math.abs(p.y - y) < 13 && x0 < p.x1 && x1 > p.x0)) ?? slots[0];
    placed.push({ x0, x1, y: ly });
    return { ...it, ly };
  });
}
