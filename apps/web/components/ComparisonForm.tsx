"use client";

import type { Catalog, ComparisonRequest, Overrides } from "@sim/contracts";
import { useState } from "react";
import { Badge, cn, Dot, Field, inputCls, Segmented } from "./ui";

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

const pill =
  "cursor-pointer appearance-none rounded-full border border-border bg-surface py-1.5 pl-3.5 pr-8 text-sm font-medium outline-none transition hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-[var(--ring)] bg-no-repeat bg-[length:10px] bg-[right_0.85rem_center]";
const chevron = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E\")" };

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

  return (
    <div>
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <label htmlFor="amt" className="eyebrow">
            You send
          </label>
          <div className="mt-1 flex items-baseline gap-2">
            <input
              id="amt"
              aria-label={`Total debited from sender (${value.source_currency})`}
              className="display min-w-0 bg-transparent text-6xl leading-none outline-none placeholder:text-faint"
              style={{ fieldSizing: "content", minWidth: "1ch", maxWidth: "100%" } as React.CSSProperties}
              inputMode="decimal"
              value={value.send_amount}
              aria-invalid={!!amountError}
              onChange={(e) => set({ send_amount: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            <span className="text-xl font-medium text-muted">{value.source_currency}</span>
            {busy && <span className="ml-1 h-3 w-3 animate-spin self-center rounded-full border-[1.5px] border-border border-t-text" aria-label="Pricing" />}
          </div>
          <p className={cn("mt-2 text-xs", amountError ? "text-danger" : "text-faint")}>
            {amountError ?? "Total debited from the sender — identical for every route."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="From" className={pill} style={chevron} value={value.source_country} onChange={(e) => setCountry("source", e.target.value)}>
            {catalog.countries.map((c) => (
              <option key={c.code} value={c.code} disabled={c.code === value.destination_country}>
                {c.name} · {c.currency}
              </option>
            ))}
          </select>
          <button
            onClick={swap}
            aria-label="Swap direction"
            title="Swap direction"
            className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text"
          >
            ⇄
          </button>
          <select aria-label="To" className={pill} style={chevron} value={value.destination_country} onChange={(e) => setCountry("destination", e.target.value)}>
            {catalog.countries.map((c) => (
              <option key={c.code} value={c.code} disabled={c.code === value.source_country}>
                {c.name} · {c.currency}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-6 py-3">
        <div className="flex gap-1">
          {["100", "1000", "10000", "100000"].map((a) => {
            const v = value.source_currency === "JPY" ? String(Number(a) * 150) : a;
            return (
              <button
                key={a}
                onClick={() => set({ send_amount: v })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs tabular transition",
                  value.send_amount === v ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(v))}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Segmented
            label="Route objective"
            value={value.objective ?? "MOST_RECEIVED"}
            onChange={(objective) => set({ objective, deadline_minutes: objective === "WITHIN_DEADLINE" ? (value.deadline_minutes ?? 24 * 60) : value.deadline_minutes })}
            options={[
              { value: "MOST_RECEIVED", label: "Most received" },
              { value: "FASTEST", label: "Fastest" },
              { value: "WITHIN_DEADLINE", label: "Within a deadline" },
            ]}
          />
          <button
            aria-expanded={showOptions}
            onClick={() => setShowOptions((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-text"
          >
            Options
            {nonDefaultOptions > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-text px-1 text-[10px] text-bg">{nonDefaultOptions}</span>}
            <span aria-hidden className={cn("text-[9px] transition", showOptions && "rotate-180")}>▼</span>
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="flex flex-col gap-5 border-t border-border bg-surface-2/40 px-6 py-5">
          {corridor && (
            <p className="flex items-start gap-2 text-xs text-muted">
              <Dot tone={corridor.usdc ? "accent" : "warn"} className="mt-1.5" />
              {corridor.usdc ? "USDC and conventional routes available." : "No USDC route for this corridor."} {corridor.explanation}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Field label="Sender starts funding at" htmlFor="start" hint="Blank = now. Weekends shift bank legs.">
              <input
                id="start"
                type="datetime-local"
                className={inputCls}
                value={value.start_time ? toLocalInput(value.start_time) : ""}
                onChange={(e) => set({ start_time: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </Field>
            {value.objective === "WITHIN_DEADLINE" && (
              <Field label="Time limit (hours, typical)" htmlFor="dl">
                <input
                  id="dl"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={value.deadline_minutes ? value.deadline_minutes / 60 : ""}
                  onChange={(e) => set({ deadline_minutes: e.target.value ? Math.max(1, Math.round(Number(e.target.value) * 60)) : null })}
                />
              </Field>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-medium">Market assumptions</span>
              {overridesActive && <Badge tone="warn">simulation active</Badge>}
              {overridesActive && (
                <button className="ml-auto text-xs text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => set({ overrides: DEFAULT_OVERRIDES })}>
                  Reset to observed market
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {OVERRIDE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`ov-${f.key}`}>
                  <input
                    id={`ov-${f.key}`}
                    type="number"
                    step={f.step}
                    className={inputCls}
                    placeholder={f.nullable ? "default" : undefined}
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
