"use client";

import type { ComparisonResponse } from "@sim/contracts";
import { useMemo, useState } from "react";
import { received, routeGraph, type MapNode, type Names } from "@/lib/derive";
import { chainSym, num, venueSym } from "@/lib/format";
import { useWidth } from "./useWidth";
import { ChartTip, cn, Panel, PanelHead } from "../ui/kit";

const ROW = 34;
const NODE_H = 26;
const COLS = ["Sender venue", "Chain · native USDC", "Recipient venue"];

/** Sequential shade for "how much arrives via this link": one hue, light→dark (dark→bright on dark theme). */
const shade = (t: number) => `color-mix(in oklab, var(--seq-hi) ${Math.round(15 + 85 * t)}%, var(--seq-lo))`;

export function RouteMap({
  data,
  names,
  focus,
  onFocus,
}: {
  data: ComparisonResponse;
  names: Names;
  focus: string | null;
  onFocus: (nodeId: string | null) => void;
}) {
  const g = useMemo(() => routeGraph(data.routes), [data]);
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ node: MapNode; x: number; y: number } | null>(null);
  const ccy = data.request.destination_currency;
  const dp = ccy === "JPY" ? 0 : 2;

  const W = Math.max(w, 600);
  const rows = Math.max(...g.cols.map((c) => c.length), 1);
  const H = rows * ROW + 8;
  const nodeW = [Math.min(200, W * 0.26), Math.min(190, W * 0.26), Math.min(200, W * 0.26)];
  const colX = [0, (W - nodeW[1]) / 2, W - nodeW[2]];
  const pos = new Map<string, { x: number; y: number; w: number }>();
  g.cols.forEach((col, ci) => {
    const off = ((rows - col.length) * ROW) / 2;
    col.forEach((n, i) => pos.set(n.id, { x: colX[ci], y: 4 + off + i * ROW, w: nodeW[ci] }));
  });

  const vals = g.edges.map((e) => e.best);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const t = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 1);

  // Highlight: routes through the hovered node, else through the focused node.
  const active = hover?.node.id ?? focus;
  const lit = useMemo(() => {
    if (!active) return null;
    const ids = new Set<string>();
    for (const e of g.edges) if (e.from === active || e.to === active) e.routeIds.forEach((id) => ids.add(id));
    return ids;
  }, [active, g.edges]);
  const edgeLit = (ids: Set<string>) => !lit || [...ids].some((id) => lit.has(id));
  const nodeLit = (id: string) => !lit || g.edges.some((e) => (e.from === id || e.to === id) && edgeLit(e.routeIds));

  const wise = data.routes.find((r) => r.type === "conventional_provider" && r.eligible);
  const wiseV = wise ? received(wise) : null;

  if (!g.edges.length) {
    return (
      <Panel aria-labelledby="map-h">
        <PanelHead id="map-h" title="Route map" sub="No eligible USDC route for this corridor, so there is nothing to map." />
      </Panel>
    );
  }

  const label = (n: MapNode) => (n.col === 1 ? names.net(n.key) : names.venue(n.key));

  return (
    <Panel aria-labelledby="map-h">
      <PanelHead
        id="map-h"
        title="Route map"
        sub={`Every priced USDC path, ${g.cols[0].length} × ${g.cols[1].length} × ${g.cols[2].length}. Each node shows the most a recipient gets through it; links shade darker as more arrives. Click a node to filter the ladder.`}
        right={
          focus && (
            <button type="button" onClick={() => onFocus(null)} className="text-xs text-muted hover:text-text">
              Clear filter ✕
            </button>
          )
        }
      />
      <div className="px-4 pb-1">
        <div className="mb-1.5 grid grid-cols-3 text-center">
          {COLS.map((c, i) => (
            <span key={c} className={cn("eyebrow", i === 0 && "text-left", i === 2 && "text-right")}>
              {c}
            </span>
          ))}
        </div>
        <div ref={ref} className="scroll-thin relative overflow-x-auto">
          <svg width={W} height={H} role="img" aria-label="Route map of sender venues, chains and recipient venues" className="block">
            {g.edges.map((e) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              const x1 = a.x + a.w;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const on = edgeLit(e.routeIds);
              return (
                <path
                  key={e.from + e.to}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  style={{ stroke: shade(t(e.best)) }}
                  strokeWidth={on && lit ? 2.5 : 1.5}
                  strokeOpacity={on ? 1 : 0.12}
                  className="transition-[stroke-opacity]"
                />
              );
            })}
            {[...g.nodes.values()].map((n) => {
              const p = pos.get(n.id)!;
              const on = nodeLit(n.id);
              const sel = focus === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={sel}
                  aria-label={`${label(n)}: best ${num(n.best, dp)} ${ccy} across ${n.count} routes`}
                  className="cursor-pointer outline-none"
                  opacity={on ? 1 : 0.35}
                  onMouseEnter={() => setHover({ node: n, x: p.x + p.w / 2, y: p.y + NODE_H })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ node: n, x: p.x + p.w / 2, y: p.y + NODE_H })}
                  onBlur={() => setHover(null)}
                  onClick={() => onFocus(sel ? null : n.id)}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onFocus(sel ? null : n.id))}
                >
                  <rect
                    width={p.w}
                    height={NODE_H}
                    rx={n.col === 1 ? NODE_H / 2 : 7}
                    fill="var(--panel-2)"
                    stroke={sel ? "var(--usdc)" : "var(--line-2)"}
                    strokeWidth={sel ? 1.5 : 1}
                  />
                  <text x={9} y={NODE_H / 2 + 4} className="fill-[var(--text)] font-mono text-[10px] font-semibold">
                    {n.col === 1 ? chainSym(n.key) : venueSym(n.key)}
                  </text>
                  {p.w - (n.col === 1 ? 50 : 38) - 62 > 24 && (
                    <text x={n.col === 1 ? 50 : 38} y={NODE_H / 2 + 4} className="fill-[var(--muted)] text-[11px]">
                      {truncate(label(n), Math.floor((p.w - (n.col === 1 ? 50 : 38) - 62) / 6))}
                    </text>
                  )}
                  <text x={p.w - 8} y={NODE_H / 2 + 4} textAnchor="end" className="fill-[var(--text)] font-mono text-[10.5px]">
                    {compactAmt(n.best, dp)}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover && (
            <ChartTip x={hover.x} y={hover.y} w={W}>
              <div className="font-medium">{label(hover.node)}</div>
              <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-muted">
                <span>Routes through</span>
                <span className="num text-right text-text">{hover.node.count}</span>
                <span>Best received</span>
                <span className="num text-right text-text">
                  {num(hover.node.best, dp)} {ccy}
                </span>
                {wiseV != null && (
                  <>
                    <span>vs Wise</span>
                    <span className={cn("num text-right", hover.node.best - wiseV >= 0 ? "text-up" : "text-down")}>
                      {hover.node.best - wiseV >= 0 ? "+" : "−"}
                      {num(Math.abs(hover.node.best - wiseV), dp)}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-faint">{hover.node.bestRoute.provider_steps.join(" → ")}</div>
            </ChartTip>
          )}
        </div>
      </div>
      {/* Scale legend: the sequential ramp with the Wise outcome marked on it for reference. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2.5 text-[11px] text-muted">
        <span>Most received via link</span>
        <div className="relative flex items-center gap-2">
          <span className="num">{num(lo, dp)}</span>
          <span className="relative h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${shade(0)}, ${shade(1)})` }}>
            {wiseV != null && wiseV >= lo && wiseV <= hi && (
              <span
                className="absolute -top-1 h-4 w-0.5 rounded bg-wise"
                style={{ left: `${t(wiseV) * 100}%` }}
                title={`Wise delivers ${num(wiseV, dp)} ${ccy}`}
              />
            )}
          </span>
          <span className="num">
            {num(hi, dp)} {ccy}
          </span>
        </div>
        {wiseV != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 rounded bg-wise" aria-hidden /> Wise {num(wiseV, dp)}
            {(wiseV < lo || wiseV > hi) && <span className="text-faint">({wiseV < lo ? "below" : "above"} every USDC link)</span>}
          </span>
        )}
      </div>
    </Panel>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function compactAmt(v: number, dp: number) {
  return v >= 100000 ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v) : num(v, v >= 10000 ? 0 : dp);
}
