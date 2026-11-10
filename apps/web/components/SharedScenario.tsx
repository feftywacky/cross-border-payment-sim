"use client";

import type { Catalog, ScenarioOut } from "@sim/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, exportUrl } from "@/lib/api";
import { flag, money, when } from "@/lib/format";
import { requestToQuery } from "@/lib/query";
import { Research } from "./sim/Research";
import { Results } from "./sim/Results";
import { SnapshotStrip } from "./sim/Ticker";
import { ErrorNote, Spinner, Tag } from "./ui/kit";

export function SharedScenario({ id }: { id: string }) {
  const [s, setS] = useState<ScenarioOut | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.scenario(id).then(setS).catch((e) => setErr(e.message));
    api.catalog().then(setCatalog).catch(() => undefined); // names only; the scenario renders without it
  }, [id]);
  if (err) return <div className="pt-8"><ErrorNote title="This scenario is unavailable.">{err}</ErrorNote></div>;
  if (!s) return <div className="pt-8"><Spinner label="Loading saved scenario" /></div>;
  const c = s.comparison;
  const r = c.request;
  // Same inputs and assumptions, minus the pinned start time: the point is to re-price now.
  const q = requestToQuery({ ...r, start_time: null });
  const btn = "inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium transition";
  return (
    <div className="pt-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Tag>Read-only</Tag>
            <span className="eyebrow">Saved scenario</span>
          </div>
          <h1 className="mt-2 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span aria-hidden>{flag(r.source_country)}</span>
            {money(r.send_amount, r.source_currency)}
            <span aria-hidden className="text-faint">→</span>
            <span aria-hidden>{flag(r.destination_country)}</span>
            {r.destination_currency}
            {s.label && <span className="text-[13px] font-normal text-muted">· {s.label}</span>}
          </h1>
          <p className="mt-1 max-w-[90ch] text-[12px] text-muted">
            Saved {when(s.created_at)}. {s.replay_note} Model {c.model_version} · catalog {c.catalog_version}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <a className={`${btn} text-muted hover:bg-hover hover:text-text`} href={exportUrl(s.id, "csv")}>
            Download CSV
          </a>
          <a className={`${btn} text-muted hover:bg-hover hover:text-text`} href={exportUrl(s.id, "json")}>
            Download JSON
          </a>
          <Link href={`/?${q}`} className={`${btn} bg-usdc text-white hover:brightness-110`}>
            Open with current prices
          </Link>
        </div>
      </div>
      <div className="mb-3">
        <SnapshotStrip data={c} readOnly />
      </div>
      <Results
        data={c}
        catalog={catalog}
        research={s.sensitivity && <Research data={s.sensitivity} loading={false} error={null} currency={r.source_currency} amount={r.send_amount} />}
      />
    </div>
  );
}
