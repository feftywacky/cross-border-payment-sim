import type { SourceStatus } from "@sim/contracts";

const DP: Record<string, number> = { JPY: 0, USDC: 2 };

/** Format a decimal-string amount for display. Full-precision strings are shown in detail views. */
export function money(amount: string | null | undefined, unit: string, opts: { dp?: number; sign?: boolean } = {}) {
  if (amount == null) return "—";
  const n = Number(amount);
  const dp = opts.dp ?? DP[unit] ?? 2;
  const body = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  }).format(n);
  return `${body} ${unit}`;
}

export function pct(v: string | null | undefined, dp = 2) {
  if (v == null) return "—";
  return `${Number(v).toFixed(dp)}%`;
}

export function minutes(m: number | null | undefined): string {
  if (m == null) return "Unknown";
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  if (m < 60 * 48) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h} h ${mm} m` : `${h} h`;
  }
  return `${(m / 1440).toFixed(1)} days`;
}

export function durationRange(d: { min?: number | null; typical?: number | null; max?: number | null; known: boolean }) {
  if (!d.known) return "Unknown";
  return `${minutes(d.min)} – ${minutes(d.max)}`;
}

export function when(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const STATUS_LABEL: Record<SourceStatus, string> = {
  live_api: "Live order book",
  provider_estimate: "Provider estimate",
  published_tariff: "Published fee",
  historical: "Historical",
  user_assumption: "Assumption",
  unavailable: "Unavailable",
};

export function statusLabel(status: SourceStatus, sourceId?: string | null) {
  if (status === "live_api" && sourceId?.startsWith("ecb:")) return "ECB daily reference";
  if (status === "live_api" && sourceId?.startsWith("network:")) return "Live network data";
  if (status === "live_api" && sourceId && !sourceId.startsWith("book:")) return "Live data";
  return STATUS_LABEL[status];
}

export const EXCLUSION_LABEL: Record<string, string> = {
  VENUE_UNAVAILABLE_IN_COUNTRY: "Venue not available in country",
  NO_FIAT_SUPPORT: "No fiat support",
  METHOD_UNSUPPORTED: "Funding/cash-out method not verified",
  NO_MARKET: "No order book",
  SOURCE_UNAVAILABLE: "Market data unavailable",
  STALE_PRICE: "Price observation expired",
  NOT_NATIVE_USDC: "Not native USDC",
  UNDER_MINIMUM: "Below minimum",
  OVER_LIMIT: "Over limit",
  INSUFFICIENT_DEPTH: "Insufficient liquidity",
  PRICE_IMPACT_CAP: "Price impact too large",
  UNDER_MIN_ORDER: "Below minimum order",
  NON_POSITIVE_AMOUNT: "Fees exceed amount",
  CAPABILITY_UNSUPPORTED: "Capability unsupported",
  PROVIDER_UNAVAILABLE_IN_COUNTRY: "Provider unavailable",
  FUNDING_METHOD_UNSUPPORTED: "Funding method unsupported",
  REFERENCE_FX_UNAVAILABLE: "Reference FX unavailable",
};

export const ROUTE_TYPE_LABEL = { usdc: "USDC", conventional_provider: "Provider", bank_wire: "Bank wire" } as const;

/** Regional-indicator flag emoji for an ISO country code ("DE" → 🇩🇪). */
export function flag(code: string | null | undefined) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Compact amount for axes and chips: 1.2K, 280K, 1.5M. */
export function compact(n: number | string, max = 1) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: max }).format(Number(n));
}

/** Plain number with fixed decimals and grouping, no unit. */
export function num(v: string | number | null | undefined, dp = 2, sign = false) {
  if (v == null || v === "") return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(Number(v));
}

/** Short duration for dense cells: 45m, 1h10, 24h48, 2.1d. */
export function dur(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h${String(mm).padStart(2, "0")}` : `${h}h`;
  }
  return `${(m / 1440).toFixed(1)}d`;
}

/** Ticker-style symbols for chains and venues (neutral monograms; identity is the text). */
export const CHAIN_SYMBOL: Record<string, string> = {
  ethereum: "ETH", base: "BASE", arbitrum: "ARB", optimism: "OP", polygon: "POL", avalanche: "AVAX", linea: "LINEA",
  solana: "SOL", stellar: "XLM", algorand: "ALGO", sui: "SUI", aptos: "APT", noble: "NOBLE", tron: "TRX", bsc: "BSC",
};
export const VENUE_SYMBOL: Record<string, string> = { kraken: "KR", coinbase: "CB", bitstamp: "BS", binance: "BN", okx: "OKX", bybit: "BY", wise: "W" };
export const chainSym = (id: string | null | undefined) => (id ? (CHAIN_SYMBOL[id] ?? id.slice(0, 4).toUpperCase()) : "—");
export const venueSym = (id: string | null | undefined) => (id ? (VENUE_SYMBOL[id] ?? id.slice(0, 2).toUpperCase()) : "—");
