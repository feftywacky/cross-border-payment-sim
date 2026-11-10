"use client";

import type { Catalog, ComparisonRequest, ComparisonResponse, SensitivityResponse } from "@sim/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, exportUrl } from "@/lib/api";
import { ago, flag } from "@/lib/format";
import { queryToRequest, requestToQuery } from "@/lib/query";
import { Button, ErrorNote, inputCls, Skeleton, Spinner } from "../ui/kit";
import { AXIS_LABEL, Research, type Axis } from "./Research";
import { Results } from "./Results";
import { StressLab } from "./StressLab";
import { amountProblem, SwapCard } from "./SwapCard";
import { SnapshotStrip, Ticker } from "./Ticker";

export function Simulator() {
  const q = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [req, setReq] = useState<ComparisonRequest | null>(null);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sens, setSens] = useState<SensitivityResponse | null>(null);
  const [sensLoading, setSensLoading] = useState(false);
  const [sensError, setSensError] = useState<string | null>(null);
  const [axis, setAxis] = useState<Axis>("network_fee_multiplier");
  const [range, setRange] = useState({ min: "", max: "" });
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
        setReq(queryToRequest(c, new URLSearchParams(q.toString())));
      })
      .catch((e) => setError(`Could not load the catalog: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reqKey = useMemo(() => JSON.stringify(req), [req]);

  // Re-price on every input change (debounced); the previous result stays visible, dimmed, meanwhile.
  useEffect(() => {
    if (!req || !catalog) return;
    if (amountProblem(req.send_amount, catalog.currencies.find((c) => c.code === req.source_currency))) return;
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
          if (e.name !== "AbortError") setError(e instanceof ApiError && e.status === 429 ? "Rate limited; wait a few seconds." : e.message);
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
      router.replace(`${pathname}?${requestToQuery(req)}`, { scroll: false });
    }, 350);
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

  // Keep the research view in step with the shown baseline and the chosen stress axis.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(runSensitivity, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, axis]);

  const sweepCurrent =
    !!sens && !!data && JSON.stringify({ ...sens.request.baseline, start_time: null }) === JSON.stringify({ ...data.request, start_time: null });
  const sweepPending = !!data && !sweepCurrent && !sensError;

  const save = async () => {
    if (!data) return;
    setShareBusy(true);
    try {
      const r = data.request;
      const s = await api.saveScenario(data.id, sweepCurrent ? sens!.id : null, `${r.source_currency}→${r.destination_currency} ${r.send_amount}`);
      setShare({ id: s.id, url: `${window.location.origin}${s.share_path}` });
    } catch (e) {
      setError(`Could not save the scenario: ${(e as Error).message}`);
    } finally {
      setShareBusy(false);
    }
  };

  if (!catalog || !req) {
    return (
      <div className="pt-8">
        {error ? <ErrorNote title={error}>Check that the API is running, then reload.</ErrorNote> : <Spinner label="Loading the corridor catalog" />}
      </div>
    );
  }

  const src = catalog.countries.find((c) => c.code === req.source_country);
  const dst = catalog.countries.find((c) => c.code === req.destination_country);

  return (
    <>
      {data ? <Ticker data={data} /> : <div className="-mx-4 h-[29px] border-b border-line" />}
      <div className="mt-5 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span aria-hidden>{flag(src?.code)}</span>
            {src?.name}
            <span aria-hidden className="text-faint">→</span>
            <span aria-hidden>{flag(dst?.code)}</span>
            {dst?.name}
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Bank balance to bank balance. Native-USDC routes through every exchange pair and chain, against Wise and a retail SWIFT wire.
          </p>
        </div>
        {data && <SnapshotStrip data={data} />}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-[60px]">
          <SwapCard catalog={catalog} value={req} onChange={setReq} data={data} loading={loading} />
          <StressLab value={req.overrides!} onChange={(overrides) => setReq({ ...req, overrides })} />
          <div className="rounded-2xl border border-line bg-panel p-3">
            {share ? (
              <div className="space-y-2">
                <p className="text-[12px] text-muted">
                  <span className="font-medium text-text">Saved.</span> Read-only snapshot; prices never refresh.
                </p>
                <div className="flex">
                  <input readOnly aria-label="Scenario link" value={share.url} onFocus={(e) => e.target.select()} className={`${inputCls} num h-8 min-w-0 flex-1 rounded-r-none text-[11px]`} />
                  <Button
                    size="sm"
                    className="h-8 rounded-l-none"
                    onClick={() => navigator.clipboard.writeText(share.url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="flex gap-3 text-[12px]">
                  <a className="text-muted hover:text-text" href={exportUrl(share.id, "csv")}>
                    Download CSV
                  </a>
                  <a className="text-muted hover:text-text" href={exportUrl(share.id, "json")}>
                    Download JSON
                  </a>
                </div>
              </div>
            ) : (
              <Button className="w-full" onClick={save} disabled={!data || shareBusy || loading || sensLoading || sweepPending}>
                {shareBusy ? "Saving…" : sensLoading || sweepPending ? "Preparing sweep…" : "Save and share"}
              </Button>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {error && (
            <ErrorNote title="Couldn't price this comparison.">
              {error}
              {data && ` Showing the last good result from ${ago(data.snapshot.created_at)}.`}
            </ErrorNote>
          )}
          {!data && !error && <ResultsSkeleton />}
          {data && (
            <Results
              data={data}
              catalog={catalog}
              busy={loading}
              research={
                <Research
                  data={sens}
                  loading={sensLoading}
                  error={sensError}
                  currency={req.source_currency}
                  amount={data.request.send_amount}
                  controls={
                    <div className="flex flex-wrap items-end gap-2 text-[11px]">
                      <label className="flex flex-col gap-1">
                        <span className="eyebrow">Amounts from</span>
                        <input className={`${inputCls} num h-8 w-24 text-xs`} placeholder="auto" inputMode="decimal" value={range.min} onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="eyebrow">to</span>
                        <input className={`${inputCls} num h-8 w-28 text-xs`} placeholder="auto" inputMode="decimal" value={range.max} onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="eyebrow">Stress axis</span>
                        <select className={`${inputCls} h-8 text-xs`} value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
                          {Object.entries(AXIS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="outline" size="sm" className="h-8" onClick={runSensitivity} disabled={sensLoading}>
                        {sensLoading ? "Sweeping…" : "Re-run"}
                      </Button>
                    </div>
                  }
                />
              }
            />
          )}
        </div>
      </div>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading results">
      <Skeleton className="h-[260px] w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[340px] w-full rounded-xl" />
    </div>
  );
}
