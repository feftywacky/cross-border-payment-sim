"use client";

import type { Catalog, ComparisonRequest, ComparisonResponse } from "@sim/contracts";
import { useEffect, useRef, useState } from "react";
import { flag, num } from "@/lib/format";
import { cn, Seg, Spinner } from "../ui/kit";

type Ccy = Catalog["currencies"][number];

export function amountProblem(v: string, ccy: Ccy | undefined): string | null {
  if (v.trim() === "") return "Enter an amount";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Not a number";
  if (!ccy) return null;
  if (n < Number(ccy.amount_min)) return `Minimum ${num(ccy.amount_min, 0)} ${ccy.code}`;
  if (n > Number(ccy.amount_max)) return `Maximum ${num(ccy.amount_max, 0)} ${ccy.code}`;
  return null;
}

/** Amount presets per currency band: a quick way to feel how size changes the answer. */
const presets = (ccy: Ccy | undefined) =>
  ccy?.code === "JPY" ? ["10000", "300000", "3000000", "30000000"] : ["100", "2500", "25000", "250000"];

function CountrySelect({ id, catalog, value, onChange, exclude, label }: { id: string; catalog: Catalog; value: string; onChange: (c: string) => void; exclude?: string; label: string }) {
  const c = catalog.countries.find((x) => x.code === value);
  return (
    <label htmlFor={id} className="relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-line-2 bg-panel pr-8 pl-2 text-sm font-medium transition hover:border-faint">
      <span aria-hidden className="text-lg leading-none">{flag(value)}</span>
      <span className="num">{c?.currency}</span>
      <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute right-3 h-3 w-3 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4.5l3 3 3-3" />
      </svg>
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {catalog.countries
          .filter((x) => x.code !== exclude)
          .map((x) => (
            <option key={x.code} value={x.code}>
              {flag(x.code)} {x.name} · {x.currency}
            </option>
          ))}
      </select>
    </label>
  );
}

function RailPicker({ label, rails, value, onChange }: { label: string; rails: Catalog["countries"][number]["rails"]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {[{ id: "any_bank", name: "Any rail", schedule: "", description: "Let the router pick the best rail." }, ...rails].map((r) => {
        const on = value === r.id;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={r.description}
            onClick={() => onChange(r.id)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11.5px] transition",
              on ? "border-usdc bg-usdc-soft text-usdc-ink" : "border-line text-muted hover:border-line-2 hover:text-text",
            )}
          >
            {r.name}
            {r.schedule === "24/7" && <span className="font-mono text-[9.5px] opacity-75">24/7</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SwapCard({
  catalog,
  value,
  onChange,
  data,
  loading,
}: {
  catalog: Catalog;
  value: ComparisonRequest;
  onChange: (r: ComparisonRequest) => void;
  data: ComparisonResponse | null;
  loading: boolean;
}) {
  const src = catalog.countries.find((c) => c.code === value.source_country)!;
  const dst = catalog.countries.find((c) => c.code === value.destination_country)!;
  const ccy = catalog.currencies.find((c) => c.code === src.currency);
  const [amount, setAmount] = useState(value.send_amount);
  const [seenAmount, setSeenAmount] = useState(value.send_amount);
  if (seenAmount !== value.send_amount) {
    setSeenAmount(value.send_amount);
    setAmount(value.send_amount);
  }
  const problem = amountProblem(amount, ccy);
  const corridor = catalog.corridors.find((c) => c.source_country === src.code && c.destination_country === dst.code);

  const best = data?.routes.find((r) => r.id === data.recommended_route_id);
  const fresh = data && data.request.send_amount === value.send_amount && data.request.destination_country === value.destination_country && data.request.source_country === value.source_country;

  const setCountry = (side: "src" | "dst", code: string) => {
    const c = catalog.countries.find((x) => x.code === code)!;
    if (side === "src") {
      const other = code === dst.code ? catalog.countries.find((x) => x.code !== code)! : dst;
      const keep = c.currency === src.currency;
      onChange({
        ...value,
        source_country: code,
        source_currency: c.currency,
        destination_country: other.code,
        destination_currency: other.currency,
        funding_method: "any_bank",
        payout_method: other.code === dst.code ? value.payout_method : "any_bank",
        send_amount: keep ? value.send_amount : (catalog.currencies.find((x) => x.code === c.currency)?.amount_default ?? value.send_amount),
      });
    } else {
      onChange({ ...value, destination_country: code, destination_currency: c.currency, payout_method: "any_bank" });
    }
  };

  const flip = () => {
    const nc = catalog.currencies.find((x) => x.code === dst.currency);
    onChange({
      ...value,
      source_country: dst.code,
      source_currency: dst.currency,
      destination_country: src.code,
      destination_currency: src.currency,
      funding_method: "any_bank",
      payout_method: "any_bank",
      send_amount: dst.currency === src.currency ? value.send_amount : (nc?.amount_default ?? value.send_amount),
    });
  };

  // Debounced commit of typed amounts (the parent debounces the request too; this keeps the field responsive).
  const commitT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const onAmount = (v: string) => {
    const clean = v.replace(/[^\d.]/g, "");
    setAmount(clean);
    if (commitT.current) clearTimeout(commitT.current);
    if (!amountProblem(clean, ccy)) commitT.current = setTimeout(() => onChange({ ...latest.current, send_amount: clean }), 250);
  };

  return (
    <section aria-label="Transfer" className="rounded-2xl border border-line bg-panel p-2 shadow-[0_1px_0_var(--line)]">
      {/* You send */}
      <div className={cn("rounded-xl border bg-panel-2 px-3.5 pt-3 pb-3 transition", problem ? "border-down/50" : "border-transparent focus-within:border-line-2")}>
        <div className="flex items-center justify-between">
          <label htmlFor="amount" className="eyebrow">
            You send <span className="normal-case tracking-normal">· total debited from sender</span>
          </label>
          <span className="truncate text-[11px] text-faint">{src.name}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!!problem}
            aria-describedby={problem ? "amount-err" : undefined}
            className="num min-w-0 flex-1 bg-transparent text-[32px] leading-10 font-medium tracking-tight outline-none placeholder:text-faint"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder="0"
          />
          <CountrySelect id="src" label="Sender country" catalog={catalog} value={src.code} onChange={(c) => setCountry("src", c)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {presets(ccy).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onAmount(p)}
              className={cn("num rounded-md px-1.5 py-0.5 text-[11px] transition", amount === p ? "bg-hover text-text" : "text-faint hover:bg-hover hover:text-text")}
            >
              {Number(p).toLocaleString()}
            </button>
          ))}
          {problem && (
            <span id="amount-err" role="alert" className="ml-auto text-[11.5px] text-down">
              {problem}
            </span>
          )}
        </div>
      </div>

      {/* Flip */}
      <div className="relative z-10 -my-3 flex justify-center">
        <button
          type="button"
          onClick={flip}
          aria-label="Swap sender and recipient"
          title="Swap direction"
          className="group flex h-9 w-9 items-center justify-center rounded-xl border-4 border-panel bg-hover text-muted transition hover:text-text"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 transition group-hover:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" />
          </svg>
        </button>
      </div>

      {/* Recipient gets */}
      <div className="rounded-xl bg-panel-2 px-3.5 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Recipient gets · best estimate</span>
          <span className="truncate text-[11px] text-faint">{dst.name}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <output
            aria-live="polite"
            aria-label="Best recipient amount"
            className={cn("num min-w-0 flex-1 truncate text-[32px] leading-10 font-medium tracking-tight", (!fresh || loading) && "text-faint")}
          >
            {best?.recipient_amount ? num(best.recipient_amount, dst.currency === "JPY" ? 0 : 2) : "—"}
          </output>
          <CountrySelect id="dst" label="Recipient country" catalog={catalog} value={dst.code} exclude={src.code} onChange={(c) => setCountry("dst", c)} />
        </div>
        <div className="mt-2 flex min-h-5 items-center gap-2 text-[11.5px] text-muted">
          {loading ? (
            <Spinner label="Pricing every route…" />
          ) : best && data ? (
            <>
              <span className="num">
                1 {src.currency} = {Number(best.effective_rate).toFixed(5)} {dst.currency}
              </span>
              {data.reference_fx && <span className="num text-faint">ref {Number(data.reference_fx.rate).toFixed(5)}</span>}
            </>
          ) : (
            <span className="text-faint">No eligible route</span>
          )}
        </div>
      </div>

      {/* Rails */}
      <div className="space-y-3 px-2 pt-3.5 pb-2">
        <div>
          <div className="eyebrow mb-1.5">Pay in via</div>
          <RailPicker label="Funding rail" rails={src.rails} value={value.funding_method ?? "any_bank"} onChange={(funding_method) => onChange({ ...value, funding_method })} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Pay out via</div>
          <RailPicker label="Payout rail" rails={dst.rails} value={value.payout_method ?? "any_bank"} onChange={(payout_method) => onChange({ ...value, payout_method })} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Optimise for</div>
          <div className="flex flex-wrap items-center gap-2">
            <Seg
              label="Rank routes by"
              value={value.objective ?? "MOST_RECEIVED"}
              onChange={(objective) => onChange({ ...value, objective, deadline_minutes: objective === "WITHIN_DEADLINE" ? (value.deadline_minutes ?? 24 * 60) : value.deadline_minutes })}
              options={[
                { value: "MOST_RECEIVED", label: "Most received" },
                { value: "FASTEST", label: "Fastest" },
                { value: "WITHIN_DEADLINE", label: "Deadline" },
              ]}
            />
            {value.objective && value.objective !== "MOST_RECEIVED" && (
              <Seg
                label="Time measured as"
                size="sm"
                value={value.time_basis ?? "END_TO_END"}
                onChange={(time_basis) => onChange({ ...value, time_basis })}
                options={[
                  { value: "END_TO_END", label: "End to end" },
                  { value: "CONVERSION", label: "Conversion only" },
                ]}
              />
            )}
            {value.objective === "WITHIN_DEADLINE" && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                within
                <input
                  type="number"
                  min={1}
                  aria-label="Time limit in hours"
                  className="num h-7 w-14 rounded-md border border-line-2 bg-panel-2 px-2 text-xs outline-none focus:border-usdc"
                  value={value.deadline_minutes ? value.deadline_minutes / 60 : ""}
                  onChange={(e) => onChange({ ...value, deadline_minutes: e.target.value ? Math.max(1, Math.round(Number(e.target.value) * 60)) : null })}
                />
                h
              </label>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="start" className="eyebrow mb-1.5 block">
            Sender starts funding
          </label>
          <div className="flex items-center gap-2">
            <input
              id="start"
              type="datetime-local"
              className="num h-7 rounded-md border border-line-2 bg-panel-2 px-2 text-xs text-text outline-none focus:border-usdc"
              value={value.start_time ? toLocalInput(value.start_time) : ""}
              onChange={(e) => onChange({ ...value, start_time: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            {value.start_time ? (
              <button type="button" className="text-[11.5px] text-muted hover:text-text" onClick={() => onChange({ ...value, start_time: null })}>
                Reset to now
              </button>
            ) : (
              <span className="text-[11.5px] text-faint">now</span>
            )}
          </div>
        </div>
        {corridor && (
          <p className="flex items-start gap-2 rounded-lg border border-line px-2.5 py-2 text-[11.5px] leading-[17px] text-muted">
            <span className={cn("mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full", corridor.usdc ? "bg-usdc" : "bg-faint")} aria-hidden />
            <span>
              <span className="text-text">{corridor.usdc ? `${corridor.usdc_venue_pairs} USDC venue pairs` : "No USDC path"}</span> · {corridor.explanation}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
