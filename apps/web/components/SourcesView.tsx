"use client";

import type { SourcesStatus } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ago, statusLabel, when } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Spinner } from "./ui";

const KIND: Record<string, string> = {
  book: "Exchange order books",
  ecb: "Reference FX (ECB)",
  boc: "Cross-check FX (Bank of Canada)",
  network: "Blockchain network conditions",
  wise: "Conventional provider quote",
};

export function SourcesView() {
  const [s, setS] = useState<SourcesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => {
    setBusy(true);
    api.sources(true).then(setS).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    api.sources(false).then(setS).catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="p-8 text-danger">{err}</p>;
  if (!s) return <div className="p-8"><Spinner label="Checking sources" /></div>;
  const groups = Object.entries(KIND).map(([k, label]) => [label, s.adapters.filter((a) => a.kind === k)] as const);
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-5 pb-10 pt-4">
      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <div className="mr-auto">
          <h1 className="font-semibold">Source status & freshness</h1>
          <p className="text-xs text-muted">
            Snapshot <span className="font-mono">{s.snapshot_id}</span> · generated {when(s.generated_at)} · mode {s.data_mode} · catalog {s.catalog_version}
          </p>
        </div>
        <Badge tone={s.tariffs_reviewed === s.tariffs_total ? "ok" : "warn"}>
          Tariffs reviewed {s.tariffs_reviewed}/{s.tariffs_total} · {s.tariffs_assumed} assumptions
        </Badge>
        <Button onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh now"}</Button>
      </Card>
      {s.errors.length > 0 && (
        <Card className="p-4 text-sm" role="alert">
          <b className="text-danger">Source errors</b> — affected routes are shown as unavailable, never back-filled:
          <ul className="mt-1 list-inside list-disc text-xs">{s.errors.map((e, i) => <li key={i}><span className="font-mono">{e.source_id}</span>: {e.message}</li>)}</ul>
        </Card>
      )}
      {groups.map(([label, rows]) => (
        <Card key={label}>
          <CardHeader title={label} sub={`${rows.length} source(s)`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-1.5">Source</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5">Observed</th>
                  <th className="px-3 py-1.5">Expires</th><th className="px-3 py-1.5">Freshness</th><th className="px-3 py-1.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.source_id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono">
                      {a.provenance_url ? <a className="underline" href={a.provenance_url} target="_blank" rel="noreferrer">{a.source_id}</a> : a.source_id}
                    </td>
                    <td className="px-3 py-1.5"><Badge tone={a.status === "unavailable" ? "danger" : a.status === "live_api" ? "ok" : "warn"}>{statusLabel(a.status, a.source_id)}</Badge></td>
                    <td className="px-3 py-1.5">{a.observed_at ? `${when(a.observed_at)} (${ago(a.observed_at)})` : "—"}</td>
                    <td className="px-3 py-1.5">{when(a.expires_at)}</td>
                    <td className="px-3 py-1.5">{a.status === "unavailable" ? "—" : a.fresh ? <Badge tone="ok">fresh</Badge> : <Badge tone="warn">stale</Badge>}</td>
                    <td className="px-3 py-1.5 text-muted">
                      {a.error ?? ""}
                      {a.credentials_configured != null && ` Credentials configured: ${a.credentials_configured ? "yes" : "no"}.`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted">
        Freshness policies: order books cached ≤15 s and expire for “current” use after 60 s; network conditions ≤30 s; ECB/BoC daily benchmarks;
        tariffs reviewed manually. These are app policies, not provider promises.
      </p>
    </div>
  );
}
