"use client";

import type { ScenarioOut } from "@sim/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, exportUrl } from "@/lib/api";
import { when } from "@/lib/format";
import { ResearchCard, ResearchCharts } from "./Research";
import { RouteTable, StatusLine, Verdict } from "./Results";
import { RouteDetail } from "./RouteDetail";
import { Drawer, RoutePath, Spinner } from "./ui";

export function SharedScenario({ id }: { id: string }) {
  const [s, setS] = useState<ScenarioOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    api.scenario(id).then(setS).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <p className="p-8 text-danger">Scenario unavailable: {err}</p>;
  if (!s) return <div className="p-8"><Spinner label="Loading saved scenario" /></div>;
  const c = s.comparison;
  const r = c.request;
  const open = c.routes.find((x) => x.id === openId);
  const q = new URLSearchParams({ from: r.source_country, to: r.destination_country, amount: r.send_amount });
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-5 pb-10 pt-4">
      <header className="px-1">
        <div className="eyebrow">Saved scenario · {when(s.created_at)}</div>
        <h1 className="display mt-2 text-4xl">{s.label ?? "Saved scenario"}</h1>
        <p className="mt-2 text-sm text-muted">
          {Number(r.send_amount).toLocaleString()} {r.source_currency} from {r.source_country} → {r.destination_currency} in {r.destination_country}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/?${q}`} className="rounded-full bg-text px-3.5 py-1.5 text-[13px] font-medium text-bg hover:opacity-85">
            Open with current prices
          </Link>
          <a className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-text" href={exportUrl(s.id, "csv")}>Download CSV</a>
          <a className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-text" href={exportUrl(s.id, "json")}>Download JSON</a>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          {s.replay_note} Model {c.model_version} · catalog {c.catalog_version}.
        </p>
      </header>
      <StatusLine data={c} readOnly />
      <Verdict data={c} onOpen={setOpenId} />
      <RouteTable data={c} onOpen={setOpenId} />
      {s.sensitivity && (
        <ResearchCard>
          <ResearchCharts data={s.sensitivity} currency={r.source_currency} />
        </ResearchCard>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open && <RoutePath label={open.label} />}>
        {open && <RouteDetail r={open} sourceCurrency={r.source_currency} />}
      </Drawer>
    </div>
  );
}
