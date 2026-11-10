"use client";

import type { ComparisonResponse } from "@sim/contracts";
import { useMemo } from "react";
import { tickerOf } from "@/lib/derive";
import { ago } from "@/lib/format";
import { cn, Dot, Tag } from "../ui/kit";
import { isStressed } from "./StressLab";

/** Market tape: every rate and chain fee the comparison actually priced against. Pauses on hover. */
export function Ticker({ data }: { data: ComparisonResponse }) {
  const items = useMemo(() => tickerOf(data), [data]);
  const track = (dup: boolean) =>
    items.map((t) => (
      <span key={(dup ? "d" : "") + t.key} aria-hidden={dup} className="flex shrink-0 items-center gap-2 px-4 font-mono text-[11px]">
        <span className="text-faint">{t.label}</span>
        <span className="text-text">{t.value}</span>
        {t.sub && <span className={t.tone === "down" ? "text-down" : "text-up"}>{t.sub}</span>}
      </span>
    ));
  return (
    <div className="relative -mx-4 overflow-hidden border-b border-line bg-panel/60" aria-label="Market data used in this comparison">
      <div className="tape flex w-max py-1.5">
        {track(false)}
        {track(true)}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

export function SnapshotStrip({ data, readOnly }: { data: ComparisonResponse; readOnly?: boolean }) {
  const s = data.snapshot;
  const recorded = s.data_mode === "fixture";
  const stressed = data.is_simulation_override || isStressed(data.request.overrides);
  const errs = data.source_errors.length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
      <span className="flex items-center gap-1.5">
        <Dot tone={recorded ? "assumed" : "live"} pulse={!recorded && !readOnly} />
        <span className="text-text">{recorded ? "Recorded data" : readOnly ? "Saved snapshot" : "Live snapshot"}</span>
        <span className="num text-faint">{s.id}</span>
      </span>
      <span className="num">{s.observation_count} observations</span>
      <span>priced {ago(s.created_at)}</span>
      <span className="num">
        {data.routes.length} routes · {data.excluded.length} excluded
      </span>
      {errs > 0 && <Tag tone="down" title={data.source_errors.map((e) => `${e.source_id}: ${e.message}`).join("\n")}>{errs} source error(s)</Tag>}
      {stressed && <Tag tone="warn">Simulation · overrides on</Tag>}
      {readOnly && <Tag>Read-only</Tag>}
      {data.warnings.map((w) => (
        <span key={w} className={cn("text-warn")}>
          △ {w}
        </span>
      ))}
    </div>
  );
}
