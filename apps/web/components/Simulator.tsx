"use client";

import type { Catalog, ComparisonRequest, ComparisonResponse, SensitivityResponse } from "@sim/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, exportUrl } from "@/lib/api";
import { ComparisonForm, DEFAULT_OVERRIDES } from "./ComparisonForm";
import { AXIS_LABEL, ResearchCard, ResearchCharts } from "./Research";
import { RouteTable, StatusLine, Verdict } from "./Results";
import { RouteDetail } from "./RouteDetail";
import { Button, Card, Drawer, Field, inputBase, RoutePath, Spinner } from "./ui";

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
    return <div className="mx-auto max-w-[1080px] px-5 py-10">{error ? <p className="text-danger">{error}</p> : <Spinner label="Loading catalog" />}</div>;
  }

  const shareAction = share ? null : (
    <Button variant="secondary" onClick={save} disabled={!data || shareBusy || loading || sensLoading || sweepPending}>
      {shareBusy ? "Saving…" : sensLoading || sweepPending ? "Preparing…" : "Save scenario"}
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-5 pb-10 pt-4">
      <h1 className="sr-only">Compare a transfer</h1>
      <Card>
        <ComparisonForm catalog={catalog} value={req} onChange={setReq} busy={loading} />
      </Card>

      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      {!data && !error && (
        <div className="py-16 text-center">
          <Spinner label="Fetching order books, reference FX and network conditions" />
        </div>
      )}
      {data && (
        <>
          <StatusLine data={data} />

          {share && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-soft">
              <span className="mr-auto text-xs text-muted">Read-only link to this exact snapshot — prices never refresh.</span>
              <input readOnly className={`${inputBase} w-80 max-w-full font-mono text-xs`} value={share.url} onFocus={(e) => e.target.select()} aria-label="Scenario link" />
              <Button variant="primary" onClick={() => navigator.clipboard.writeText(share.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
                {copied ? "Copied" : "Copy link"}
              </Button>
              <a className="px-1 text-xs text-muted hover:text-text" href={exportUrl(share.id, "csv")}>CSV</a>
              <a className="px-1 text-xs text-muted hover:text-text" href={exportUrl(share.id, "json")}>JSON</a>
            </div>
          )}

          <div className={loading ? "opacity-60 transition" : "transition"} aria-busy={loading}>
            <Verdict data={data} onOpen={setOpenId} action={shareAction} />
          </div>
          <RouteTable data={data} onOpen={setOpenId} />

          <ResearchCard right={sensLoading ? <Spinner label="Sweeping" /> : undefined}>
            {sensError && <p className="mb-3 text-sm text-danger">{sensError}</p>}
            {sens ? (
              <div className={sensLoading ? "opacity-60 transition" : "transition"}>
                <ResearchCharts
                  data={sens}
                  currency={req.source_currency}
                  controls={
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label="Amount from" htmlFor="rmin">
                        <input id="rmin" className={`${inputBase} w-24`} placeholder="50" inputMode="decimal" value={range.min} onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))} />
                      </Field>
                      <Field label="to" htmlFor="rmax">
                        <input id="rmax" className={`${inputBase} w-28`} placeholder="250000" inputMode="decimal" value={range.max} onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))} />
                      </Field>
                      <Field label="Stress axis" htmlFor="axis">
                        <select id="axis" className={inputBase} value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
                          {Object.entries(AXIS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </Field>
                      <Button variant="secondary" onClick={runSensitivity} disabled={sensLoading}>
                        {sensLoading ? "Sweeping…" : "Re-run sweep"}
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="py-10 text-center">
                <Spinner label="Running sensitivity sweep" />
              </div>
            )}
          </ResearchCard>
        </>
      )}

      <Drawer open={!!openRoute} onClose={() => setOpenId(null)} title={openRoute && <RoutePath label={openRoute.label} />}>
        {openRoute && data && <RouteDetail r={openRoute} sourceCurrency={data.request.source_currency} />}
      </Drawer>
    </div>
  );
}
