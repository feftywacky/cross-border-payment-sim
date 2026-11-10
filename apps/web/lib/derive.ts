/* Pure derivations over API responses. Nothing here invents data: every figure is read from the response,
   and anything aggregated (lanes, map edges, ticker) keeps the route ids it came from. */
import type { Catalog, ComparisonResponse, LegResult, RouteResult } from "@sim/contracts";
import type { Family } from "@/components/ui/kit";
import { chainSym } from "./format";

export const familyOf = (r: Pick<RouteResult, "type">): Family =>
  r.type === "usdc" ? "usdc" : r.type === "bank_wire" ? "bank" : "wise";

export const FAMILY_LABEL: Record<Family, string> = { usdc: "USDC", wise: "Wise", bank: "Bank wire" };

export const received = (r: RouteResult) => (r.recipient_amount == null ? null : Number(r.recipient_amount));

export function names(catalog: Catalog | null | undefined) {
  const venues = new Map(catalog?.venues.map((v) => [v.id, v.name]) ?? []);
  const nets = new Map(catalog?.networks.map((n) => [n.id, n.name]) ?? []);
  const rails = new Map(catalog?.countries.flatMap((c) => c.rails.map((r) => [r.id, r.name] as const)) ?? []);
  const countries = new Map(catalog?.countries.map((c) => [c.code, c]) ?? []);
  return {
    venue: (id?: string | null) => (id ? (venues.get(id) ?? id) : "—"),
    net: (id?: string | null) => (id ? (nets.get(id) ?? id) : "—"),
    rail: (id?: string | null) => (id ? (rails.get(id) ?? id.replace(/_/g, " ")) : "—"),
    country: (code: string) => countries.get(code),
  };
}
export type Names = ReturnType<typeof names>;

/* ------------------------------------------------------------------ lanes */

/** A lane is one sender-venue/rail → recipient-venue/rail pairing; its variants differ only by chain.
    Conventional routes are single-variant lanes. Lanes keep the server's ranking order (first appearance). */
export interface Lane {
  key: string;
  family: Family;
  best: RouteResult;
  variants: RouteResult[];
}

export function lanesOf(routes: RouteResult[]): Lane[] {
  const map = new Map<string, Lane>();
  for (const r of routes) {
    const key = r.type === "usdc" ? `${r.source_venue}|${r.funding_method}|${r.destination_venue}|${r.payout_method}` : r.id;
    const lane = map.get(key);
    if (lane) lane.variants.push(r);
    else map.set(key, { key, family: familyOf(r), best: r, variants: [r] });
  }
  return [...map.values()];
}

/* ------------------------------------------------------------------ route map */

export interface MapNode {
  id: string;
  col: 0 | 1 | 2;
  key: string;
  best: number;
  bestRoute: RouteResult;
  count: number;
}
export interface MapEdge {
  from: string;
  to: string;
  best: number;
  count: number;
  routeIds: Set<string>;
}

/** Three-column graph sender venue → chain → recipient venue over eligible USDC routes. */
export function routeGraph(routes: RouteResult[]) {
  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, MapEdge>();
  const touch = (col: 0 | 1 | 2, key: string, r: RouteResult, v: number) => {
    const id = `${col}:${key}`;
    const n = nodes.get(id);
    if (!n) nodes.set(id, { id, col, key, best: v, bestRoute: r, count: 1 });
    else {
      n.count++;
      if (v > n.best) Object.assign(n, { best: v, bestRoute: r });
    }
    return id;
  };
  const link = (a: string, b: string, r: RouteResult, v: number) => {
    const k = `${a}>${b}`;
    const e = edges.get(k) ?? { from: a, to: b, best: -Infinity, count: 0, routeIds: new Set<string>() };
    e.best = Math.max(e.best, v);
    e.count++;
    e.routeIds.add(r.id);
    edges.set(k, e);
  };
  for (const r of routes) {
    const v = received(r);
    if (r.type !== "usdc" || !r.eligible || v == null || !r.source_venue || !r.network || !r.destination_venue) continue;
    const a = touch(0, r.source_venue, r, v);
    const b = touch(1, r.network, r, v);
    const c = touch(2, r.destination_venue, r, v);
    link(a, b, r, v);
    link(b, c, r, v);
  }
  const cols = [0, 1, 2].map((c) => [...nodes.values()].filter((n) => n.col === c).sort((x, y) => y.best - x.best));
  return { cols, edges: [...edges.values()], nodes };
}

/* ------------------------------------------------------------------ ticker */

export interface TickItem {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}

/** Market strip built from the comparison itself: reference FX, each USDC book touched, each chain's gas. */
export function tickerOf(data: ComparisonResponse): TickItem[] {
  const out: TickItem[] = [];
  const fx = data.reference_fx;
  if (fx) {
    out.push({ key: "ref", label: `${fx.base}/${fx.quote} ECB`, value: Number(fx.rate).toFixed(5) });
    const cc = fx.cross_check as { source?: string; rate?: string; diff_bps?: string } | null | undefined;
    if (cc?.rate) {
      const d = Number(cc.diff_bps);
      out.push({ key: "boc", label: `${fx.base}/${fx.quote} BoC`, value: Number(cc.rate).toFixed(5), sub: `${d > 0 ? "+" : ""}${d.toFixed(1)}bp`, tone: d >= 0 ? "up" : "down" });
    }
  }
  const books = new Map<string, TickItem>();
  const gas = new Map<string, TickItem>();
  for (const r of data.routes) {
    for (const l of r.legs) {
      const d = l.detail as Record<string, unknown>;
      if (l.kind === "trade" && typeof d.symbol === "string" && !books.has(`${l.provider}${d.symbol}`)) {
        const mid = Number(d.mid ?? d.best_price);
        books.set(`${l.provider}${d.symbol}`, {
          key: `b${l.provider}${d.symbol}`,
          label: `${String(d.symbol).replace(/[-_]/, "/")} · ${l.provider.split(" ")[0]}`,
          value: Number.isFinite(mid) ? mid.toPrecision(6) : "—",
        });
      }
      if (l.kind === "network" && typeof d.network === "string" && !gas.has(d.network) && d.self_custody_gas_usd != null) {
        const usd = Number(d.self_custody_gas_usd);
        gas.set(d.network, { key: `g${d.network}`, label: `${chainSym(d.network)} gas`, value: usd < 0.0001 ? "<$0.0001" : `$${usd.toPrecision(2)}` });
      }
    }
  }
  return [...out, ...books.values(), ...gas.values()];
}

/* ------------------------------------------------------------------ timing */

export type TimeBasis = "END_TO_END" | "CONVERSION";

/** The duration to rank/plot by: the whole transfer, or only the conversion phase. */
export function timeOf(r: RouteResult, basis: TimeBasis | undefined) {
  return basis === "CONVERSION" && r.timing_split ? r.timing_split.conversion : r.duration;
}

/** End-to-end time split into bank rails (fiat pay-in, holds, payout) and the conversion itself (trade, withdrawal, on-chain, credit). */
export function phaseSplit(r: RouteResult) {
  const s = r.timing_split;
  const total = r.duration.typical ?? null;
  if (!s || total == null || !s.rails.known || !s.conversion.known) return null;
  return { total, rails: s.rails, conversion: s.conversion };
}

export const LEG_ICON: Record<string, string> = {
  funding: "M3 12h10M8 7l5 5-5 5",
  trade: "M4 8h12l-3-3M16 12H4l3 3",
  withdrawal: "M10 15V4M6 8l4-4 4 4",
  network: "M4 10h3m6 0h3M7 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  deposit: "M10 4v11M6 11l4 4 4-4",
  hold: "M7 5v10M13 5v10",
  conversion: "M4 8h12l-3-3M16 12H4l3 3",
  payout: "M4 16h12M10 4v9M6 9l4 4 4-4",
};

export const legIsMarket = (l: LegResult) => l.kind === "trade" && Array.isArray((l.detail as { levels?: unknown }).levels);
