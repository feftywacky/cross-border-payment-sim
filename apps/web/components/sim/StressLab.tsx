"use client";

import type { Overrides } from "@sim/contracts";
import { useState } from "react";
import { DEFAULT_OVERRIDES } from "@/lib/query";
import { cn, Tag } from "../ui/kit";

/* Each knob mirrors OVERRIDE_BOUNDS in services/api/app/schemas.py. Presets are the useful stops; the field takes any value in range. */
type Knob = { key: keyof Overrides; label: string; unit: string; min: number; max: number; presets: string[]; nullable?: boolean; hint: string };
const KNOBS: Knob[] = [
  { key: "network_fee_multiplier", label: "Chain congestion", unit: "× gas", min: 0, max: 1000, presets: ["1", "5", "25", "100"], hint: "Multiplies live network fees." },
  { key: "spread_bps", label: "Extra FX spread", unit: "bps", min: 0, max: 5000, presets: ["0", "10", "50", "200"], hint: "Added to every conversion and book." },
  { key: "depth_multiplier", label: "Book depth", unit: "× qty", min: 0.001, max: 1000, presets: ["0.1", "0.5", "1", "5"], hint: "Scales order-book quantities (thin or deep markets)." },
  { key: "max_price_impact_bps", label: "Max price impact", unit: "bps", min: 0.001, max: 5000, presets: ["25", "100", "500"], hint: "Book fills that move price more than this are rejected." },
  { key: "trading_fee_override_pct", label: "Taker fee override", unit: "%", min: 0, max: 10, presets: ["0", "0.1", "0.5"], nullable: true, hint: "Replaces every venue's taker fee." },
  { key: "provider_fee_multiplier", label: "Provider fees", unit: "×", min: 0, max: 100, presets: ["0.5", "1", "2"], hint: "Multiplies Wise and bank-wire fees." },
  { key: "bank_fx_spread_bps", label: "Bank FX margin", unit: "bps", min: 0, max: 5000, presets: ["100", "250", "400"], nullable: true, hint: "Replaces the assumed 250 bps bank-wire margin." },
  { key: "funding_delay_hours", label: "Funding delay", unit: "h", min: 0, max: 720, presets: ["0", "4", "24"], hint: "Extra wait before funds are usable at the venue." },
  { key: "payout_delay_hours", label: "Payout delay", unit: "h", min: 0, max: 720, presets: ["0", "4", "24"], hint: "Extra wait on the final payout." },
];

export const isStressed = (o: Overrides | undefined) => !!o && KNOBS.some((k) => (o[k.key] ?? null) !== (DEFAULT_OVERRIDES[k.key] ?? null));

function KnobRow({ k, value, onChange }: { k: Knob; value: string | null; onChange: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value ?? "");
  }
  const n = Number(draft);
  const bad = draft !== "" && (!Number.isFinite(n) || n < k.min || n > k.max);
  const changed = (value ?? null) !== (DEFAULT_OVERRIDES[k.key] ?? null);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-t border-line py-2.5 first:border-0">
      <label htmlFor={`k-${k.key}`} className="min-w-0" title={k.hint}>
        <span className={cn("text-[12.5px]", changed ? "text-text" : "text-muted")}>{k.label}</span>
        {changed && <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={`k-${k.key}`}
          inputMode="decimal"
          aria-invalid={bad}
          placeholder={k.nullable ? "default" : undefined}
          className={cn("num h-7 w-[72px] rounded-md border bg-panel-2 px-2 text-right text-xs outline-none focus:border-usdc", bad ? "border-down" : "border-line-2")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === "" && k.nullable) return onChange(null);
            if (!bad && draft !== "") onChange(String(n));
            else setDraft(value ?? "");
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className="num w-10 text-[10.5px] text-faint">{k.unit}</span>
      </div>
      <div className="col-span-2 flex flex-wrap gap-1">
        {k.presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn("num rounded px-1.5 py-px text-[10.5px] transition", value === p ? "bg-hover text-text" : "text-faint hover:bg-hover hover:text-text")}
          >
            {p}
          </button>
        ))}
        {k.nullable && value != null && (
          <button type="button" onClick={() => onChange(null)} className="rounded px-1.5 py-px text-[10.5px] text-faint hover:bg-hover hover:text-text">
            default
          </button>
        )}
      </div>
    </div>
  );
}

export function StressLab({ value, onChange }: { value: Overrides; onChange: (o: Overrides) => void }) {
  const stressed = isStressed(value);
  return (
    <details className="group rounded-2xl border border-line bg-panel" open={stressed || undefined}>
      <summary className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-faint transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span className="text-[13px] font-semibold">Stress lab</span>
          <span className="text-[11.5px] text-muted">counterfactual market conditions</span>
        </span>
        {stressed && <Tag tone="warn">Simulation</Tag>}
      </summary>
      <div className="px-4 pb-3">
        {KNOBS.map((k) => (
          <KnobRow key={k.key} k={k} value={(value[k.key] as string | null | undefined) ?? null} onChange={(v) => onChange({ ...value, [k.key]: v })} />
        ))}
        {stressed && (
          <button type="button" onClick={() => onChange({ ...DEFAULT_OVERRIDES })} className="mt-2 text-xs text-muted underline-offset-2 hover:text-text hover:underline">
            Reset all to observed market
          </button>
        )}
      </div>
    </details>
  );
}
