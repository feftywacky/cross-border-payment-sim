"""FastAPI application: versioned internal API under /api/v1."""

from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from app import db, sensitivity, service
from app.adapters import wise
from app.adapters.http import HTTP
from app.catalog.seed import CATALOG
from app.catalog.view import CatalogOut, catalog_out
from app.config import MODEL_VERSION, settings
from app.export import to_csv
from app.provenance import Snapshot, build_snapshot
from app.schemas import (
    ComparisonRequest,
    ComparisonResponse,
    Observation,
    ScenarioCreate,
    ScenarioOut,
    SensitivityRequest,
    SensitivityResponse,
    SourceError,
    SourceStatus,
)

LAST_SNAPSHOT: dict[str, Snapshot] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    yield
    await HTTP.aclose()


app = FastAPI(
    title="Stablecoin Cross-Border Payment Simulator API",
    version="1.0.0",
    description="Read-only research simulator. Estimates only; never moves money or places orders.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"],
                   allow_headers=["content-type"])

_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def throttle(request: Request, call_next):
    if request.method == "POST":
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = _hits[ip]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.rate_limit_per_minute:
            return JSONResponse({"detail": "Too many requests; slow down."}, status_code=429,
                                headers={"Retry-After": "10"})
        q.append(now)
    return await call_next(request)


api = APIRouter(prefix="/api/v1")


@api.get("/health")
def health() -> dict:
    return {"status": "ok", "model_version": MODEL_VERSION, "catalog_version": CATALOG.version}


@api.get("/ready")
def ready() -> dict:
    ok = db.ping()
    if not ok:
        raise HTTPException(503, "database unavailable")
    return {"status": "ready", "database": ok, "data_mode": settings.data_mode}


@api.get("/catalog", response_model=CatalogOut)
def get_catalog() -> CatalogOut:
    return catalog_out(CATALOG)


class AdapterStatus(BaseModel):
    source_id: str
    kind: str
    status: SourceStatus
    observed_at: datetime | None
    fetched_at: datetime | None
    expires_at: datetime | None
    fresh: bool
    error: str | None
    provenance_url: str | None
    credentials_configured: bool | None = None


class SourcesStatus(BaseModel):
    generated_at: datetime
    data_mode: str
    snapshot_id: str | None
    adapters: list[AdapterStatus]
    errors: list[SourceError]
    tariffs_total: int
    tariffs_reviewed: int
    tariffs_assumed: int
    catalog_version: str
    observations: list[Observation]


@api.get("/sources/status", response_model=SourcesStatus)
async def sources_status(refresh: bool = False) -> SourcesStatus:
    snap = LAST_SNAPSHOT.get("all")
    if refresh or snap is None:
        snap = await build_snapshot(set(CATALOG.currencies))
        LAST_SNAPSHOT["all"] = snap
        db.save_snapshot(snap)
    now = datetime.now(UTC)
    adapters = []
    for o in sorted(snap.observations.values(), key=lambda o: o.source_id):
        adapters.append(AdapterStatus(
            source_id=o.source_id, kind=o.source_id.split(":")[0], status=o.status, observed_at=o.observed_at,
            fetched_at=o.fetched_at, expires_at=o.expires_at, fresh=bool(o.expires_at and o.expires_at > now),
            error=o.error, provenance_url=o.provenance_url))
    adapters.append(AdapterStatus(
        source_id="wise:quote", kind="wise", status="live_api" if wise.configured() else "unavailable",
        observed_at=None, fetched_at=None, expires_at=None, fresh=False,
        error=None if wise.configured() else "Partner credentials not configured; assumed tariff used",
        provenance_url=wise.DOC, credentials_configured=wise.configured()))
    cat = catalog_out(CATALOG)
    return SourcesStatus(
        generated_at=now, data_mode=settings.data_mode, snapshot_id=snap.id, adapters=adapters, errors=snap.errors,
        tariffs_total=len(cat.tariffs), tariffs_reviewed=sum(1 for t in cat.tariffs if t.reviewed_at),
        tariffs_assumed=sum(1 for t in cat.tariffs if t.basis == "user_assumption"), catalog_version=CATALOG.version,
        observations=[o for o in snap.observations.values() if not o.source_id.startswith("book:")],
    )


@api.post("/comparisons", response_model=ComparisonResponse)
async def create_comparison(req: ComparisonRequest) -> ComparisonResponse:
    try:
        service.validate(req)
    except service.ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from exc
    snap = await service.snapshot_for(req)
    resp = service.compare(req, snap)
    db.save_snapshot(snap)
    db.save_run("comparison", resp, snap.id, CATALOG.version)
    return resp


@api.get("/comparisons/{comparison_id}", response_model=ComparisonResponse)
def get_comparison(comparison_id: str) -> ComparisonResponse:
    row = db.load_run(comparison_id)
    if row is None or row.kind != "comparison":
        raise HTTPException(404, "comparison not found")
    return ComparisonResponse.model_validate(db.unpack(row.response))


@api.post("/analyses/sensitivity", response_model=SensitivityResponse)
async def create_sensitivity(req: SensitivityRequest) -> SensitivityResponse:
    try:
        service.validate(req.baseline)
    except service.ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from exc
    snap = await build_snapshot({req.baseline.source_currency, req.baseline.destination_currency})
    try:
        resp = sensitivity.run(req, snap)
    except sensitivity.GridTooLarge as exc:
        raise HTTPException(422, str(exc)) from exc
    db.save_snapshot(snap)
    db.save_run("sensitivity", resp, snap.id, CATALOG.version)
    return resp


def _scenario_out(row) -> ScenarioOut:
    comp_row = db.load_run(row.comparison_id)
    comp = ComparisonResponse.model_validate(db.unpack(comp_row.response))
    sens = None
    if row.sensitivity_id:
        srow = db.load_run(row.sensitivity_id)
        sens = SensitivityResponse.model_validate(db.unpack(srow.response)) if srow else None
    snap_kept = db.load_snapshot(comp.snapshot.id) is not None
    note = ("Stored outputs shown as originally computed. The source snapshot is retained, so results can be replayed "
            "exactly." if snap_kept else
            "Stored outputs shown as originally computed; the source snapshot is no longer retained, so replay is "
            "limited to these outputs.")
    created = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=UTC)  # SQLite drops tzinfo
    return ScenarioOut(id=row.id, created_at=created, label=row.label, share_path=f"/s/{row.id}",
                       comparison=comp, sensitivity=sens, replay_note=note)


@api.post("/scenarios", response_model=ScenarioOut)
def create_scenario(body: ScenarioCreate) -> ScenarioOut:
    comp = db.load_run(body.comparison_id)
    if comp is None or comp.kind != "comparison":
        raise HTTPException(404, "comparison not found")
    if body.sensitivity_id:
        sens = db.load_run(body.sensitivity_id)
        if sens is None or sens.kind != "sensitivity":
            raise HTTPException(404, "sensitivity run not found")
    row = db.save_scenario(f"sc_{secrets.token_urlsafe(18)}", body.label, body.comparison_id, body.sensitivity_id)
    return _scenario_out(row)


@api.get("/scenarios/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: str) -> ScenarioOut:
    row = db.load_scenario(scenario_id)
    if row is None:
        raise HTTPException(404, "scenario not found")
    return _scenario_out(row)


@api.get("/scenarios/{scenario_id}/replay", response_model=ComparisonResponse)
def replay_scenario(scenario_id: str) -> ComparisonResponse:
    """Recompute the stored comparison from its retained snapshot (determinism check)."""
    row = db.load_scenario(scenario_id)
    if row is None:
        raise HTTPException(404, "scenario not found")
    comp = ComparisonResponse.model_validate(db.unpack(db.load_run(row.comparison_id).response))
    snap = db.load_snapshot(comp.snapshot.id)
    if snap is None:
        raise HTTPException(410, "source snapshot no longer retained")
    return service.compare(comp.request, snap, replay=True, now=comp.created_at)


@api.get("/scenarios/{scenario_id}/export")
def export_scenario(scenario_id: str, format: str = Query("json", pattern="^(csv|json)$")):
    row = db.load_scenario(scenario_id)
    if row is None:
        raise HTTPException(404, "scenario not found")
    out = _scenario_out(row)
    if format == "json":
        return JSONResponse(out.model_dump(mode="json"),
                            headers={"Content-Disposition": f'attachment; filename="{scenario_id}.json"'})
    return PlainTextResponse(to_csv(out.id, out.comparison, out.sensitivity), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{scenario_id}.csv"'})


app.include_router(api)
