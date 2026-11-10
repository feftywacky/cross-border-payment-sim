"use client";

import type { Catalog, ComparisonRequest, Overrides } from "@sim/contracts";
import { useState } from "react";
import { flag } from "@/lib/format";
import { Badge, Chevron, cn, Dot, Field, inputBase, inputCls } from "./ui";

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

export function isDefaultOverrides(o: Overrides) {
  return (Object.keys(DEFAULT_OVERRIDES) as (keyof Overrides)[]).every(
    (k) => (o[k] ?? null) === (DEFAULT_OVERRIDES[k] ?? null),
  );
}

const OVERRIDE_FIELDS: { key: keyof Overrides; label: string; hint: string; step: string; nullable?: boolean }[] = [
  { key: "network_fee_multiplier", label: "Network fee ×", hint: "Congestion: scales exchange USDC withdrawal fees", step: "0.5" },
  { key: "spread_bps", label: "Extra FX spread (bps)", hint: "Widens every book and provider rate", step: "5" },
  { key: "depth_multiplier", label: "Book depth ×", hint: "Thin (<1) or deepen (>1) all order books", step: "0.1" },
  { key: "provider_fee_multiplier", label: "Provider/ramp fee ×", hint: "Scales funding, payout, Wise and bank fees", step: "0.25" },
  { key: "funding_delay_hours", label: "Funding delay (h)", hint: "Extra wait before funds are usable", step: "1" },
  { key: "payout_delay_hours", label: "Payout delay (h)", hint: "Extra wait before the recipient bank credits", step: "1" },
  { key: "bank_fx_spread_bps", label: "Bank FX margin (bps)", hint: "Default 250 bps assumption", step: "25", nullable: true },
  { key: "trading_fee_override_pct", label: "Taker fee override (%)", hint: "Replace every venue's fee tier", step: "0.01", nullable: true },
  { key: "max_price_impact_bps", label: "Max price impact (bps)", hint: "Reject deeper book fills", step: "10" },
];

const select = "cursor-pointer appearance-none bg-no-repeat bg-[length:10px] bg-[right_0.75rem_center] font-medium";
const chevron = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23777' stroke-width='1.5'/%3E%3C/svg%3E\")" };

export function ComparisonForm({
  catalog,
  value,
  onChange,
  busy,
}: {
  catalog: Catalog;
  value: ComparisonRequest;
  onChange: (v: ComparisonRequest) => void;
  busy?: boolean;
}) {
  const ov = value.overrides ?? DEFAULT_OVERRIDES;
  const overridesActive = !isDefaultOverrides(ov);
  const [showOptions, setShowOptions] = useState(overridesActive);
  const src = catalog.countries.find((c) => c.code === value.source_country)!;
  const dst = catalog.countries.find((c) => c.code === value.destination_country)!;
  const ccy = catalog.currencies.find((c) => c.code === value.source_currency);
  const corridor = catalog.corridors.find(
    (c) => c.source_country === value.source_country && c.destination_country === value.destination_country,
  );
  const set = (patch: Partial<ComparisonRequest>) => onChange({ ...value, ...patch });

  const setCountry = (side: "source" | "destination", code: string) => {
    const c = catalog.countries.find((x) => x.code === code)!;
    if (side === "source") set({ source_country: code, source_currency: c.currency, funding_method: "any_bank" });
    else set({ destination_country: code, destination_currency: c.currency, payout_method: "any_bank" });
  };
  const swap = () =>
    set({
      source_country: dst.code,
      source_currency: dst.currency,
      destination_country: src.code,
      destination_currency: src.currency,
      funding_method: "any_bank",
      payout_method: "any_bank",
    });

  const amountNum = Number(value.send_amount);
  const amountError =
    !value.send_amount || !Number.isFinite(amountNum) || amountNum <= 0
      ? "Enter a positive amount"
      : ccy && amountNum > Number(ccy.amount_max)
        ? `Max ${Number(ccy.amount_max).toLocaleString()} ${ccy.code}`
        : null;
  const nonDefaultOptions =
    (value.funding_method !== "any_bank" ? 1 : 0) + (value.payout_method !== "any_bank" ? 1 : 0) + (value.start_time ? 1 : 0) + (overridesActive ? 1 : 0);

  const countrySelect = (side: "source" | "destination") => {
    const cur = side === "source" ? src : dst;
    const other = side === "source" ? value.destination_country : value.source_country;
    return (
      <div className="relative min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg leading-none">{flag(cur.code)}</span>
        <select
          id={side === "source" ? "from" : "to"}
          aria-label={side === "source" ? "From" : "To"}
          className={cn(inputBase, "h-12 w-full pl-10 pr-8 text-[15px]", select)}
          style={chevron}
          value={cur.code}
          onChange={(e) => setCountry(side, e.target.value)}
        >
          {catalog.countries.map((c) => (
            <option key={c.code} value={c.code} disabled={c.code === other}>
              {c.name} · {c.currency}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div>
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-6">
        <div className="min-w-0">
          <label htmlFor="amt" className="text-[13px] font-medium text-muted">
            You send
          </label>
          <div
            className={cn(
              "mt-1.5 flex h-14 items-center gap-2 rounded-lg border bg-surface px-4 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
              amountError ? "border-danger" : "border-border-strong hover:border-faint",
            )}
          >
            <input
              id="amt"
              aria-label={`Total debited from sender (${value.source_currency})`}
              aria-describedby="amt-help"
              className="min-w-0 flex-1 bg-transparent text-[28px] font-semibold tracking-tight outline-none"
              inputMode="decimal"
              value={value.send_amount}
              aria-invalid={!!amountError}
              onChange={(e) => set({ send_amount: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-border-strong border-t-text" aria-label="Pricing" />}
            <span className="flex items-center gap-1.5 text-[15px] font-medium text-muted">
              <span aria-hidden>{flag(src.code)}</span>
              {value.source_currency}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <span className="text-[13px] font-medium text-muted">From → to</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            {countrySelect("source")}
            <button
              onClick={swap}
              aria-label="Swap direction"
              title="Swap direction"
              className="grid h-10 w-10 flex-none place-items-center rounded-full border border-border text-muted transition hover:rotate-180 hover:bg-surface-2 hover:text-text"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5.5h10M10 2.5l3 3-3 3M13 10.5H3M6 7.5l-3 3 3 3" />
              </svg>
            </button>
            {countrySelect("destination")}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-2.5">
        <div className="flex items-center gap-1" aria-label="Preset amounts">
          {["100", "1000", "10000", "100000"].map((a) => {
            const v = value.source_currency === "JPY" ? String(Number(a) * 150) : a;
            return (
              <button
                key={a}
                onClick={() => set({ send_amount: v })}
                aria-pressed={value.send_amount === v}
                className={cn(
                  "h-7 rounded-full px-3 text-[13px] tabular transition",
                  value.send_amount === v ? "bg-primary font-medium text-primary-ink" : "bg-surface-2 text-muted hover:bg-active hover:text-text",
                )}
              >
                {Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(v))}
              </button>
            );
          })}
        </div>
        <p id="amt-help" className={cn("text-xs", amountError ? "font-medium text-danger" : "text-muted")}>
          {amountError ?? "Same total debit for every route"}
        </p>
        <button
          aria-expanded={showOptions}
          onClick={() => setShowOptions((s) => !s)}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-text"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
            <circle cx="10" cy="4.5" r="1.5" />
            <circle cx="6" cy="11.5" r="1.5" />
          </svg>
          Methods and what-ifs
          {nonDefaultOptions > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-ink">{nonDefaultOptions}</span>}
          <Chevron className={cn("transition", showOptions ? "-rotate-90" : "rotate-90")} />
        </button>
      </div>

      {showOptions && (
        <div className="flex flex-col gap-6 border-t border-rule bg-surface-2 px-5 py-5">
          {corridor && (
            <p className="flex items-start gap-2 text-[13px] text-muted">
              <Dot tone={corridor.usdc ? "accent" : "warn"} className="mt-1.5" />
              <span>
                <span className="text-text">{corridor.usdc ? "USDC and conventional routes available." : "No USDC route for this corridor."}</span> {corridor.explanation}
              </span>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Funding method" htmlFor="fund">
              <select id="fund" className={inputCls} value={value.funding_method} onChange={(e) => set({ funding_method: e.target.value })}>
                <option value="any_bank">Any (compare all)</option>
                {src.rails.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.schedule}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recipient payout" htmlFor="pay">
              <select id="pay" className={inputCls} value={value.payout_method} onChange={(e) => set({ payout_method: e.target.value })}>
                <option value="any_bank">Any (compare all)</option>
                {dst.rails.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.schedule}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sender starts funding at" htmlFor="start" hint="Blank means now. Weekends shift bank legs.">
              <input
                id="start"
                type="datetime-local"
                className={inputCls}
                value={value.start_time ? toLocalInput(value.start_time) : ""}
                onChange={(e) => set({ start_time: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">What if the market changes?</h3>
              {overridesActive && <Badge tone="warn">What-if active</Badge>}
              {overridesActive && (
                <button className="ml-auto text-[13px] text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => set({ overrides: DEFAULT_OVERRIDES })}>
                  Reset to observed market
                </button>
              )}
            </div>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {OVERRIDE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`ov-${f.key}`}>
                  <input
                    id={`ov-${f.key}`}
                    type="number"
                    step={f.step}
                    className={inputCls}
                    placeholder={f.nullable ? "Default" : undefined}
                    value={(ov[f.key] as string | null) ?? ""}
                    onChange={(e) =>
                      set({ overrides: { ...ov, [f.key]: e.target.value === "" ? (f.nullable ? null : DEFAULT_OVERRIDES[f.key]) : e.target.value } })
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
