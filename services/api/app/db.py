"""Persistence: immutable snapshots/observations, quote runs, and shareable scenarios.

SQLite by default for a single-instance demo; set DATABASE_URL=postgresql+psycopg://... for PostgreSQL.
Large JSON payloads are stored gzip-compressed."""

from __future__ import annotations

import gzip
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import DateTime, ForeignKey, Index, LargeBinary, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


class SnapshotRow(Base):
    __tablename__ = "snapshots"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data_mode: Mapped[str] = mapped_column(String(16))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary)


class ObservationRow(Base):
    """Immutable, append-only record of each normalized observation used by a snapshot."""

    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"), index=True)
    source_id: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(24))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    value: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __table_args__ = (Index("ix_obs_source_time", "source_id", "fetched_at"),)


class QuoteRunRow(Base):
    __tablename__ = "quote_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # comparison | sensitivity
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"), index=True)
    model_version: Mapped[str] = mapped_column(String(40))
    catalog_version: Mapped[str] = mapped_column(String(40))
    request: Mapped[bytes] = mapped_column(LargeBinary)
    response: Mapped[bytes] = mapped_column(LargeBinary)


class ScenarioRow(Base):
    __tablename__ = "scenarios"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    comparison_id: Mapped[str] = mapped_column(ForeignKey("quote_runs.id"))
    sensitivity_id: Mapped[str | None] = mapped_column(ForeignKey("quote_runs.id"), nullable=True)


def _pack(obj) -> bytes:
    return gzip.compress(json.dumps(obj, default=str, separators=(",", ":")).encode())


def unpack(data: bytes):
    return json.loads(gzip.decompress(data))


_engine = None
_Session: sessionmaker | None = None


def init(url: str | None = None) -> None:
    global _engine, _Session
    url = url or settings.database_url
    if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True}
    _engine = create_engine(url, **kwargs)
    Base.metadata.create_all(_engine)
    _Session = sessionmaker(_engine, expire_on_commit=False)


def session() -> Session:
    if _Session is None:
        init()
    return _Session()


def ping() -> bool:
    try:
        with session() as s:
            s.execute(select(1))
        return True
    except Exception:  # noqa: BLE001
        return False


def save_snapshot(snap) -> None:
    payload = snap.model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(payload["observations"], sort_keys=True).encode()).hexdigest()
    with session() as s, s.begin():
        if s.get(SnapshotRow, snap.id) is not None:
            return
        s.add(SnapshotRow(id=snap.id, created_at=snap.created_at, data_mode=snap.data_mode, content_hash=digest,
                          payload=_pack(payload)))
        s.flush()
        for o in snap.observations.values():
            s.add(ObservationRow(snapshot_id=snap.id, source_id=o.source_id, status=o.status,
                                 observed_at=o.observed_at, fetched_at=o.fetched_at, value=o.value))


def load_snapshot(snapshot_id: str):
    from app.provenance import Snapshot

    with session() as s:
        row = s.get(SnapshotRow, snapshot_id)
        return Snapshot.model_validate(unpack(row.payload)) if row else None


def save_run(kind: str, resp, snapshot_id: str, catalog_version: str) -> None:
    with session() as s, s.begin():
        s.add(QuoteRunRow(id=resp.id, kind=kind, created_at=resp.created_at, snapshot_id=snapshot_id,
                          model_version=resp.model_version, catalog_version=catalog_version,
                          request=_pack(resp.request.model_dump(mode="json")), response=_pack(resp.model_dump(mode="json"))))


def load_run(run_id: str) -> QuoteRunRow | None:
    with session() as s:
        return s.get(QuoteRunRow, run_id)


def save_scenario(scenario_id: str, label: str | None, comparison_id: str, sensitivity_id: str | None) -> ScenarioRow:
    with session() as s, s.begin():
        row = ScenarioRow(id=scenario_id, created_at=datetime.now(UTC), label=label, comparison_id=comparison_id,
                          sensitivity_id=sensitivity_id)
        s.add(row)
    return row


def load_scenario(scenario_id: str) -> ScenarioRow | None:
    with session() as s:
        return s.get(ScenarioRow, scenario_id)
