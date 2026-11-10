import type { Catalog, ComparisonRequest, Overrides } from "@sim/contracts";

export const DEFAULT_OVERRIDES: Overrides = {
  spread_bps: "0",
  network_fee_multiplier: "1",
  depth_multiplier: "1",
  provider_fee_multiplier: "1",
  payout_delay_hours: "0",
  funding_delay_hours: "0",
  bank_fx_spread_bps: null,
  max_price_impact_bps: "100",
  trading_fee_override_pct: null,
};

const OVERRIDE_KEYS = Object.keys(DEFAULT_OVERRIDES) as (keyof Overrides)[];
const OBJECTIVES = ["MOST_RECEIVED", "FASTEST", "WITHIN_DEADLINE"] as const;

/** Every input that shapes a comparison, as URL parameters. Defaults are omitted to keep links short. */
export function requestToQuery(req: ComparisonRequest): URLSearchParams {
  const p = new URLSearchParams({ from: req.source_country, to: req.destination_country, amount: req.send_amount });
  if (req.objective && req.objective !== "MOST_RECEIVED") p.set("objective", req.objective);
  if (req.funding_method && req.funding_method !== "any_bank") p.set("funding", req.funding_method);
  if (req.payout_method && req.payout_method !== "any_bank") p.set("payout", req.payout_method);
  if (req.deadline_minutes) p.set("deadline", String(req.deadline_minutes));
  if (req.start_time) p.set("start", req.start_time);
  const ov = req.overrides ?? DEFAULT_OVERRIDES;
  for (const k of OVERRIDE_KEYS) {
    const v = ov[k] ?? null;
    if (v !== null && v !== (DEFAULT_OVERRIDES[k] ?? null)) p.set(k, v);
  }
  return p;
}

/** Inverse of requestToQuery; unknown or invalid values fall back to the catalog defaults. */
export function queryToRequest(catalog: Catalog, q: URLSearchParams): ComparisonRequest {
  const byCode = (code: string | null) => catalog.countries.find((c) => c.code === code);
  const src = byCode(q.get("from")) ?? byCode(catalog.default_corridor.source_country)!;
  let dst = byCode(q.get("to")) ?? byCode(catalog.default_corridor.destination_country)!;
  if (dst.code === src.code) dst = catalog.countries.find((c) => c.code !== src.code)!;
  const ccy = catalog.currencies.find((c) => c.code === src.currency);
  const rail = (country: typeof src, id: string | null) => (id && country.rails.some((r) => r.id === id) ? id : "any_bank");
  const objective = OBJECTIVES.find((o) => o === q.get("objective")) ?? "MOST_RECEIVED";
  const deadline = Number(q.get("deadline"));
  const start = q.get("start");
  const overrides = { ...DEFAULT_OVERRIDES };
  for (const k of OVERRIDE_KEYS) {
    const v = q.get(k);
    if (v != null && v !== "" && Number.isFinite(Number(v))) overrides[k] = v as never;
  }
  return {
    source_country: src.code,
    source_currency: src.currency,
    destination_country: dst.code,
    destination_currency: dst.currency,
    send_amount: q.get("amount") ?? ccy?.amount_default ?? "2500",
    funding_method: rail(src, q.get("funding")),
    payout_method: rail(dst, q.get("payout")),
    objective,
    deadline_minutes: Number.isFinite(deadline) && deadline > 0 ? Math.round(deadline) : objective === "WITHIN_DEADLINE" ? 24 * 60 : null,
    mode: "current",
    start_time: start && !Number.isNaN(Date.parse(start)) ? new Date(start).toISOString() : null,
    overrides,
  };
}
