"use client";

import type { SourcesStatus } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ago, chainSym, statusLabel, when } from "@/lib/format";
import { Button, cn, Dot, ErrorNote, Glyph, Panel, PanelHead, Skeleton, Tag } from "./ui/kit";

type Adapter = SourcesStatus["adapters"][number];
type Obs = SourcesStatus["observations"][number];

const GROUPS: { key: string; title: string; sub: string; kinds: string[] }[] = [
  { key: "fx", title: "Reference FX", sub: "ECB euro reference rates are the benchmark; Bank of Canada Valet cross-checks them. Never an executable customer rate.", kinds: ["ecb", "boc"] },
  { key: "book", title: "Order books", sub: "Public depth from each venue. Re-fetched for every comparison, so a book reads as expired between runs.", kinds: ["book"] },
  { key: "network", title: "Chains", sub: "Live fee conditions per native-USDC network: self-custody transfer cost estimates, shown for reference.", kinds: ["network"] },
  { key: "provider", title: "Providers", sub: "Conventional comparators. Without partner credentials Wise is priced from an assumed published tariff.", kinds: ["wise"] },
];

function tone(a: Adapter): "live" | "tariff" | "assumed" | "off" | "error" {
  if (a.error && a.status !== "unavailable") return "error";
  if (a.status === "live_api") return "live";
  if (a.status === "published_tariff" || a.status === "provider_estimate") return "tariff";
  if (a.status === "user_assumption") return "assumed";
  return "off";
}

function Freshness({ a, now }: { a: Adapter; now: number }) {
  if (!a.fetched_at || !a.expires_at) return null;
  const f = Date.parse(a.fetched_at);
  const e = Date.parse(a.expires_at);
  const left = Math.max(0, Math.min(1, (e - now) / (e - f || 1)));
  return (
    <div className="mt-2.5">
      <div className="h-1 overflow-hidden rounded-full bg-hover" aria-hidden>
        <div className={cn("h-full rounded-full", left > 0 ? "bg-up" : "bg-line-2")} style={{ width: `${left * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-faint">
        <span>fetched {ago(a.fetched_at)}</span>
        <span>{left > 0 ? `valid until ${when(a.expires_at)}` : "expired"}</span>
      </div>
    </div>
  );
}

function Tile({ a, o, now }: { a: Adapter; o?: Obs; now: number }) {
  const [kind, ...rest] = a.source_id.split(":");
  const id = rest.join(":");
  const t = tone(a);
  const data = (o?.data ?? {}) as Record<string, unknown>;
  let value: string | null = null;
  if (o?.value != null) {
    const v = Number(o.value);
    value = kind === "network" ? (v < 0.0001 ? "<$0.0001 / transfer" : `$${v.toPrecision(2)} / transfer`) : `${v.toPrecision(6)} ${o.unit ?? ""}`;
  }
  return (
    <li className="rounded-xl border border-line bg-panel-2/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {kind === "network" && <Glyph kind="chain" text={chainSym(id).slice(0, 4)} />}
          <div className="min-w-0">
            <div className="num truncate text-[12.5px] font-medium">{kind === "network" ? id : id.replace(/[-_]/, "/")}</div>
            <div className="eyebrow mt-0.5">{kind}</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <Dot tone={t} pulse={t === "live" && a.fresh} />
          {statusLabel(a.status, a.source_id)}
        </span>
      </div>
      {value && <div className="num mt-2 text-[15px]">{value}</div>}
      {kind === "network" && typeof data.base_fee_gwei === "string" && (
        <div className="num mt-0.5 text-[10.5px] text-faint">
          base {Number(data.base_fee_gwei).toPrecision(3)} gwei · {String(data.gas_token)} ${Number(data.gas_token_usd).toLocaleString()}
        </div>
      )}
      {a.error && <p className={cn("mt-2 text-[11.5px]", t === "error" ? "text-down" : "text-muted")}>{a.error}</p>}
      <Freshness a={a} now={now} />
      {a.provenance_url && (
        <a href={a.provenance_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10.5px] text-faint underline-offset-2 hover:text-text hover:underline">
          provenance ↗
        </a>
      )}
    </li>
  );
}

export function SourcesBoard() {
  const [s, setS] = useState<SourcesStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const load = (refresh = false) => {
    setBusy(true);
    api
      .sources(refresh)
      .then((x) => (setS(x), setErr(null), setNow(Date.now())))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    api
      .sources()
      .then((x) => (setS(x), setNow(Date.now())))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const live = s?.adapters.filter((a) => a.status === "live_api").length ?? 0;
  const obs = new Map(s?.observations.map((o) => [o.source_id, o]) ?? []);
  const reviewedPct = s ? (s.tariffs_reviewed / Math.max(1, s.tariffs_total)) * 100 : 0;
  const assumedPct = s ? (s.tariffs_assumed / Math.max(1, s.tariffs_total)) * 100 : 0;

  return (
    <div className="space-y-3 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data sources</h1>
          <p className="mt-1 max-w-[80ch] text-[12.5px] text-muted">
            Every adapter behind the latest snapshot, how fresh it is, and how much of the tariff catalog a person has reviewed.
          </p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh snapshot"}
        </Button>
      </div>
      {err && <ErrorNote title="Couldn't load source status.">{err}</ErrorNote>}
      {!s && !err && <Skeleton className="h-96 w-full rounded-xl" />}
      {s && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Panel className="p-4">
              <div className="eyebrow">Adapters live</div>
              <div className="num mt-1 text-2xl font-medium">
                {live}
                <span className="text-sm text-faint"> / {s.adapters.length}</span>
              </div>
              <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden>
                {s.adapters.map((a) => (
                  <span key={a.source_id} className={cn("flex-1", { live: "bg-up", tariff: "bg-usdc", assumed: "bg-warn", off: "bg-line-2", error: "bg-down" }[tone(a)])} />
                ))}
              </div>
            </Panel>
            <Panel className="p-4">
              <div className="eyebrow">Snapshot</div>
              <div className="num mt-1 truncate text-[15px]">{s.snapshot_id ?? "—"}</div>
              <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
                <Dot tone={s.data_mode === "fixture" ? "assumed" : "live"} />
                {s.data_mode === "fixture" ? "Recorded data" : "Live data"} · {ago(s.generated_at)}
              </div>
            </Panel>
            <Panel className="p-4">
              <div className="eyebrow">Tariffs reviewed</div>
              <div className="num mt-1 text-2xl font-medium">
                {s.tariffs_reviewed}
                <span className="text-sm text-faint"> / {s.tariffs_total}</span>
              </div>
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
                <span className="bg-up" style={{ width: `${reviewedPct}%` }} />
                <span className="hatch bg-warn/40" style={{ width: `${assumedPct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-faint">
                {s.tariffs_assumed} are explicit assumptions · catalog {s.catalog_version}
              </div>
            </Panel>
            <Panel className="p-4">
              <div className="eyebrow">Source errors</div>
              <div className={cn("num mt-1 text-2xl font-medium", s.errors.length ? "text-down" : "")}>{s.errors.length}</div>
              <div className="mt-1 text-[11px] text-faint">{s.errors.length ? s.errors.map((e) => e.source_id).join(", ") : "All adapters answered"}</div>
            </Panel>
          </div>

          {s.errors.length > 0 && (
            <Panel>
              <PanelHead title="Errors in this snapshot" />
              <ul className="px-4 pb-3 text-[12px]">
                {s.errors.map((e, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3 border-t border-line py-2">
                    <span className="num font-medium">{e.source_id}</span>
                    <span className="text-muted">{e.message}</span>
                    <span className="ml-auto text-faint">{when(e.at)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {GROUPS.map((g) => {
            const list = s.adapters.filter((a) => g.kinds.includes(a.kind));
            if (!list.length) return null;
            return (
              <Panel key={g.key} aria-labelledby={`g-${g.key}`}>
                <PanelHead id={`g-${g.key}`} title={g.title} sub={g.sub} right={<Tag>{list.length}</Tag>} />
                <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {list.map((a) => (
                    <Tile key={a.source_id} a={a} o={obs.get(a.source_id)} now={now} />
                  ))}
                </ul>
              </Panel>
            );
          })}
        </>
      )}
    </div>
  );
}
