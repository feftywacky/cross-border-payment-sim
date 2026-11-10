"use client";

import type { Catalog, ComparisonRequest, ComparisonResponse, SensitivityResponse } from "@sim/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, exportUrl } from "@/lib/api";
import { ago, flag } from "@/lib/format";
import { ComparisonForm, DEFAULT_OVERRIDES } from "./ComparisonForm";
import { AXIS_LABEL, Insights } from "./Research";
import { Hero, RouteHops, RouteTable, StatusLine } from "./Results";
import { RouteDetail } from "./RouteDetail";
import { Canvas, PageHeader } from "./Shell";
import { Button, Card, Drawer, Field, inputBase, Segmented, Skeleton, Spinner } from "./ui";

type Axis = NonNullable<import("@sim/contracts").SensitivityRequest["heatmap_axis"]>;

function initialRequest(catalog: Catalog, q: URLSearchParams): ComparisonRequest {
  const country = (code: string | null, fallback: string) => catalog.countries.find((c) => c.code === code) ?? catalog.countries.find((c) => c.code === fallback)!;
  const src = country(q.get("from"), catalog.default_corridor.source_country);
  const dst = country(q.get("to"), catalog.default_corridor.destination_country);
  const ccy = catalog.currencies.find((c) => c.code === src.currency);
  return {
    source_country: src.code,
    source_currency: src.currency,
    destination_country: dst.code === src.code ? catalog.countries.find((c) => c.code !== src.code)!.code : dst.code,
    destination_currency: (dst.code === src.code ? catalog.countries.find((c) => c.code !== src.code)! : dst).currency,
    send_amount: q.get("amount") ?? ccy?.amount_default ?? "2500",
    funding_method: q.get("funding") ?? "any_bank",
    payout_method: q.get("payout") ?? "any_bank",
    objective: (q.get("objective") as ComparisonRequest["objective"]) ?? "MOST_RECEIVED",
    deadline_minutes: q.get("deadline") ? Number(q.get("deadline")) : null,
    mode: "current",
    start_time: null,
    overrides: DEFAULT_OVERRIDES,
  };
}

export function Simulator() {
  const q = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [req, setReq] = useState<ComparisonRequest | null>(null);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sens, setSens] = useState<SensitivityResponse | null>(null);
  const [sensLoading, setSensLoading] = useState(false);
  const [sensError, setSensError] = useState<string | null>(null);
  const [axis, setAxis] = useState<Axis>("network_fee_multiplier");
  const [range, setRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [share, setShare] = useState<{ id: string; url: string } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const sensAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .catalog()
      .then((c) => {
        setCatalog(c);
        setReq(initialRequest(c, new URLSearchParams(q.toString())));
      })
      .catch((e) => setError(`Could not load catalog: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reqKey = useMemo(() => JSON.stringify(req), [req]);

  // Recompute on every parameter change (debounced); keep the previous result visible meanwhile.
  useEffect(() => {
    if (!req) return;
    const n = Number(req.send_amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (req.objective === "WITHIN_DEADLINE" && !req.deadline_minutes) return;
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      setShare(null);
      api
        .compare(req, ctrl.signal)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e instanceof ApiError && e.status === 429 ? "Rate limited — wait a few seconds." : e.message);
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
      const p = new URLSearchParams({ from: req.source_country, to: req.destination_country, amount: req.send_amount, objective: req.objective ?? "MOST_RECEIVED" });
      if (req.funding_method !== "any_bank") p.set("funding", req.funding_method!);
      if (req.payout_method !== "any_bank") p.set("payout", req.payout_method!);
      if (req.deadline_minutes) p.set("deadline", String(req.deadline_minutes));
      router.replace(`${pathname}?${p}`, { scroll: false });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const runSensitivity = () => {
    if (!req) return;
    sensAbort.current?.abort();
    const ctrl = new AbortController();
    sensAbort.current = ctrl;
    setSensLoading(true);
    setSensError(null);
    setShare(null);
    const amount_range = range.min && range.max ? { min: range.min, max: range.max, steps: 24, scale: "log" as const } : null;
    api
      .sensitivity({ baseline: req, amount_range, heatmap_axis: axis }, ctrl.signal)
      .then(setSens)
      .catch((e) => e.name !== "AbortError" && setSensError(e.message))
      .finally(() => !ctrl.signal.aborted && setSensLoading(false));
  };

  // Keep the research view in step with the baseline (and the chosen stress axis).
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(runSensitivity, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, axis]);

  // The sweep belongs to the shown comparison only if it was run on the same baseline inputs.
  const sweepCurrent =
    !!sens && !!data && JSON.stringify({ ...sens.request.baseline, start_time: null }) === JSON.stringify({ ...data.request, start_time: null });
  const sweepPending = !!data && !sweepCurrent && !sensError;

  const save = async () => {
    if (!data) return;
    setShareBusy(true);
    try {
      const s = await api.saveScenario(data.id, sweepCurrent ? sens!.id : null, `${data.request.source_currency}→${data.request.destination_currency} ${data.request.send_amount}`);
      setShare({ id: s.id, url: `${window.location.origin}${s.share_path}` });
    } catch (e) {
      setError(`Could not save scenario: ${(e as Error).message}`);
    } finally {
      setShareBusy(false);
    }
  };

  const openRoute = data?.routes.find((r) => r.id === openId);

  if (!catalog || !req) {
    return (
      <Canvas>
        <PageHeader title="Compare routes" />
        {error ? (
          <p role="alert" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <span className="font-medium text-danger">{error}</span> Check that the API is running, then reload.
          </p>
        ) : (
          <Spinner label="Loading the corridor catalog" />
        )}
      </Canvas>
    );
  }

  const country = (code: string) => catalog.countries.find((c) => c.code === code);
  const corridorTitle = (
    <span className="flex flex-wrap items-center gap-x-2.5">
      <span>
        <span aria-hidden className="mr-2">{flag(req.source_country)}</span>
        {country(req.source_country)?.name ?? req.source_country}
      </span>
      <span aria-hidden className="text-faint">→</span>
      <span>
        <span aria-hidden className="mr-2">{flag(req.destination_country)}</span>
        {country(req.destination_country)?.name ?? req.destination_country}
      </span>
    </span>
  );

  const ranking = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Rank by</span>
      <Segmented
        label="Rank routes by"
        value={req.objective ?? "MOST_RECEIVED"}
        onChange={(objective) => setReq({ ...req, objective, deadline_minutes: objective === "WITHIN_DEADLINE" ? (req.deadline_minutes ?? 24 * 60) : req.deadline_minutes })}
        options={[
          { value: "MOST_RECEIVED", label: "Most received" },
          { value: "FASTEST", label: "Fastest" },
          { value: "WITHIN_DEADLINE", label: "Deadline" },
        ]}
      />
      {req.objective === "WITHIN_DEADLINE" && (
        <label className="flex items-center gap-1.5 text-xs text-muted">
          within
          <input
            type="number"
            min={1}
            aria-label="Time limit in hours"
            className={`${inputBase} w-16`}
            value={req.deadline_minutes ? req.deadline_minutes / 60 : ""}
            onChange={(e) => setReq({ ...req, deadline_minutes: e.target.value ? Math.max(1, Math.round(Number(e.target.value) * 60)) : null })}
          />
          h
        </label>
      )}
    </div>
  );

  return (
    <Canvas>
      <PageHeader
        title={corridorTitle}
        right={
          share ? null : (
            <Button onClick={save} disabled={!data || shareBusy || loading || sensLoading || sweepPending}>
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 10V2.5M5 5.5l3-3 3 3M3 9v3.5h10V9" />
              </svg>
              {shareBusy ? "Saving…" : sensLoading || sweepPending ? "Preparing…" : "Save and share"}
            </Button>
          )
        }
      />
      {data && <StatusLine data={data} />}

      {share && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="mr-auto text-[13px] text-muted">
            <span className="font-medium text-text">Saved.</span> A read-only snapshot; prices never refresh.
          </p>
          <div className="flex w-full flex-wrap items-center sm:w-auto">
            <input readOnly className={`${inputBase} min-w-0 flex-1 rounded-r-none font-mono text-xs sm:w-80`} value={share.url} onFocus={(e) => e.target.select()} aria-label="Scenario link" />
            <Button className="rounded-l-none" onClick={() => navigator.clipboard.writeText(share.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <a className="rounded-md px-2 py-1.5 text-[13px] font-medium text-text hover:bg-surface-2" href={exportUrl(share.id, "csv")}>CSV</a>
          <a className="rounded-md px-2 py-1.5 text-[13px] font-medium text-text hover:bg-surface-2" href={exportUrl(share.id, "json")}>JSON</a>
        </div>
      )}

      <Card aria-label="Transfer">
        <ComparisonForm catalog={catalog} value={req} onChange={setReq} busy={loading} />
      </Card>

      {error && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm" role="alert">
          <span className="font-medium text-danger">Couldn&apos;t price this comparison.</span> {error}
          {data && <span className="text-muted"> Showing the last good result from {ago(data.snapshot.created_at)}.</span>}
        </p>
      )}
      {!data && !error && <HeroSkeleton />}
      {data && (
        <>
          <div className={loading ? "opacity-60 transition" : "transition"} aria-busy={loading}>
            <Hero data={data} onOpen={setOpenId} controls={ranking} />
          </div>

          <Insights
            data={sens}
            currency={req.source_currency}
            amount={data.request.send_amount}
            loading={sensLoading}
            error={sensError}
            controls={
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Amounts from" htmlFor="rmin">
                  <input id="rmin" className={`${inputBase} w-24`} placeholder="50" inputMode="decimal" value={range.min} onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))} />
                </Field>
                <Field label="to" htmlFor="rmax">
                  <input id="rmax" className={`${inputBase} w-28`} placeholder="250000" inputMode="decimal" value={range.max} onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))} />
                </Field>
                <Field label="Stress" htmlFor="axis">
                  <select id="axis" className={inputBase} value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
                    {Object.entries(AXIS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Button variant="secondary" onClick={runSensitivity} disabled={sensLoading}>
                  {sensLoading ? "Sweeping…" : "Re-run"}
                </Button>
              </div>
            }
          />

          <RouteTable data={data} onOpen={setOpenId} />
        </>
      )}

      <Drawer open={!!openRoute} onClose={() => setOpenId(null)} title={openRoute && <RouteHops r={openRoute} />}>
        {openRoute && data && <RouteDetail r={openRoute} sourceCurrency={data.request.source_currency} />}
      </Drawer>
    </Canvas>
  );
}

function HeroSkeleton() {
  return (
    <Card aria-busy aria-label="Loading results">
      <Skeleton className="m-5 h-6 w-80" />
      <div className="grid grid-cols-1 border-t border-rule lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-3 p-5 lg:border-r lg:border-rule">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4 p-5">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </Card>
  );
}
