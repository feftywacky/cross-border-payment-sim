"use client";

import type { ScenarioOut } from "@sim/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, exportUrl } from "@/lib/api";
import { when } from "@/lib/format";
import { Insights } from "./Research";
import { Finding, Hero, RouteHops, RouteTable, StatusLine } from "./Results";
import { RouteDetail } from "./RouteDetail";
import { Canvas, PageHeader } from "./Shell";
import { Drawer, Spinner } from "./ui";

const linkBtn = "inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium transition active:scale-[0.98]";

export function SharedScenario({ id }: { id: string }) {
  const [s, setS] = useState<ScenarioOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    api.scenario(id).then(setS).catch((e) => setErr(e.message));
  }, [id]);
  if (err)
    return (
      <Canvas>
        <PageHeader title="Saved scenario" />
        <p role="alert" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="font-medium text-danger">This scenario is unavailable.</span> {err}
        </p>
      </Canvas>
    );
  if (!s)
    return (
      <Canvas>
        <PageHeader title="Saved scenario" />
        <Spinner label="Loading saved scenario" />
      </Canvas>
    );
  const c = s.comparison;
  const r = c.request;
  const open = c.routes.find((x) => x.id === openId);
  const q = new URLSearchParams({ from: r.source_country, to: r.destination_country, amount: r.send_amount });
  return (
    <Canvas>
      <PageHeader
        title={s.label ?? "Saved scenario"}
        sub={<Finding data={c} />}
        right={
          <>
            <a className={`${linkBtn} text-text hover:bg-active`} href={exportUrl(s.id, "csv")}>Download CSV</a>
            <a className={`${linkBtn} text-text hover:bg-active`} href={exportUrl(s.id, "json")}>Download JSON</a>
            <Link href={`/?${q}`} className={`${linkBtn} bg-primary text-primary-ink hover:opacity-85`}>
              Open with current prices
            </Link>
          </>
        }
      />
      <StatusLine data={c} readOnly />
      <p className="text-[13px] text-muted">
        Saved {when(s.created_at)}. {s.replay_note} Model {c.model_version} · catalog {c.catalog_version}.
      </p>
      <Hero data={c} onOpen={setOpenId} />
      {s.sensitivity && <Insights data={s.sensitivity} currency={r.source_currency} amount={r.send_amount} loading={false} error={null} />}
      <RouteTable data={c} onOpen={setOpenId} />
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open && <RouteHops r={open} />}>
        {open && <RouteDetail r={open} sourceCurrency={r.source_currency} />}
      </Drawer>
    </Canvas>
  );
}
