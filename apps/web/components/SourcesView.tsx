"use client";

import type { SourcesStatus } from "@sim/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ago, statusLabel, when } from "@/lib/format";
import { Canvas, PageHeader } from "./Shell";
import { Badge, Button, Card, CardHeader, Skeleton } from "./ui";

const KIND: Record<string, string> = {
  book: "Exchange order books",
  ecb: "Reference FX (ECB)",
  boc: "Cross-check FX (Bank of Canada)",
  network: "Blockchain network conditions",
  wise: "Conventional provider quote",
};

const hasNote = (rows: SourcesStatus["adapters"]) => rows.some((a) => a.error || a.credentials_configured != null);

export function SourcesView() {
  const [s, setS] = useState<SourcesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => {
    setBusy(true);
    api.sources(true).then((x) => { setS(x); setErr(null); }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    api.sources(false).then(setS).catch((e) => setErr(e.message));
  }, []);

  const all = s?.adapters ?? [];
  const live = all.filter((a) => a.status !== "unavailable" && a.fresh).length;
  const stale = all.filter((a) => a.status !== "unavailable" && !a.fresh).length;
  const down = all.filter((a) => a.status === "unavailable").length;
  const groups = Object.entries(KIND).map(([k, label]) => [label, all.filter((a) => a.kind === k)] as const).filter(([, rows]) => rows.length > 0);

  return (
    <Canvas>
      <PageHeader
        title="Sources"
        sub={
          s ? (
            <>
              <span className="tabular">{live}</span> of <span className="tabular">{all.length}</span> sources fresh
              {down > 0 && (
                <>
                  , <span className="font-medium text-danger tabular">{down} unavailable</span>
                </>
              )}
              . Affected routes are shown as unavailable, never back-filled.
            </>
          ) : (
            "Adapter health, freshness and tariff review status."
          )
        }
        right={
          <>
            {s && <span className="text-[13px] text-muted">Checked {ago(s.generated_at)}</span>}
            <Button onClick={refresh} disabled={busy || !s}>{busy ? "Refreshing…" : "Refresh now"}</Button>
          </>
        }
      />
      {err && (
        <p role="alert" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="font-medium text-danger">Couldn&apos;t check sources.</span> {err}
        </p>
      )}

      <Card aria-label="Summary">
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {[
            ["Fresh", s ? String(live) : null],
            ["Stale", s ? String(stale) : null],
            ["Unavailable", s ? String(down) : null],
            ["Tariffs reviewed", s ? `${s.tariffs_reviewed} of ${s.tariffs_total}` : null],
          ].map(([k, v], i) => (
            <div key={k} className={`px-5 py-4 ${i > 0 ? "lg:border-l" : ""} ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} border-rule`}>
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="mt-1 text-2xl font-medium tabular">{v ?? <Skeleton className="h-7 w-14" />}</dd>
            </div>
          ))}
        </dl>
        {s && (
          <p className="border-t border-rule px-5 py-3 text-xs text-muted">
            Snapshot <span className="font-mono">{s.snapshot_id}</span> · generated {when(s.generated_at)} · mode {s.data_mode} · catalog {s.catalog_version} ·{" "}
            <span className="tabular">{s.tariffs_assumed}</span> tariffs are explicit assumptions
          </p>
        )}
      </Card>

      {s && s.errors.length > 0 && (
        <Card role="alert" className="p-5">
          <h2 className="text-base font-semibold">Source errors</h2>
          <ul className="mt-2 space-y-1 text-[13px]">
            {s.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{e.source_id}</span>: <span className="text-muted">{e.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!s && !err && <Skeleton className="h-64 w-full rounded-lg" />}
      {groups.map(([label, rows]) => (
        <Card key={label} aria-label={label}>
          <CardHeader title={label} sub={`${rows.length} ${rows.length === 1 ? "source" : "sources"}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="h-9 pl-5 pr-3 text-left font-normal">Source</th>
                  <th className="h-9 px-3 text-left font-normal">Status</th>
                  <th className="h-9 px-3 text-right font-normal">Observed</th>
                  <th className="h-9 px-3 text-right font-normal">Expires</th>
                  {hasNote(rows) && <th className="h-9 px-3 text-left font-normal">Note</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.source_id} className="border-b border-rule last:border-0">
                    <td className="py-2.5 pl-5 pr-3 font-mono text-xs">
                      {a.provenance_url ? (
                        <a className="hover:underline" href={a.provenance_url} target="_blank" rel="noreferrer">{a.source_id}</a>
                      ) : (
                        a.source_id
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap items-center gap-2">
                        {a.status === "unavailable" ? <Badge tone="danger">Unavailable</Badge> : a.fresh ? <Badge tone="ok">Fresh</Badge> : <Badge tone="warn">Stale</Badge>}
                        {a.status !== "unavailable" && <span className="text-muted">{statusLabel(a.status, a.source_id)}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {a.observed_at ? (
                        <>
                          {when(a.observed_at)}
                          <span className="block text-xs text-muted">{ago(a.observed_at)}</span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{when(a.expires_at)}</td>
                    {hasNote(rows) && (
                      <td className="px-3 py-2.5 text-muted">
                        {a.error ?? ""}
                        {a.credentials_configured != null && ` Credentials configured: ${a.credentials_configured ? "yes" : "no"}.`}
                        {!a.error && a.credentials_configured == null && "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <p className="text-[13px] text-muted">
        Freshness policies: order books are cached for up to 15 s and expire for current use after 60 s; network conditions for up to 30 s; ECB and
        Bank of Canada are daily benchmarks; tariffs are reviewed by hand. These are app policies, not provider promises.
      </p>
    </Canvas>
  );
}
