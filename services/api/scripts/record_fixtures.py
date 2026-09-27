"""Record real upstream payloads into fixtures/http for deterministic tests and offline demos.

Usage (from services/api):  DATA_MODE=record python -m scripts.record_fixtures
"""

from __future__ import annotations

import asyncio
import os
import shutil

os.environ["DATA_MODE"] = "record"

from app.adapters.http import FIXTURE_DIR, HTTP  # noqa: E402
from app.catalog.seed import CATALOG  # noqa: E402
from app.provenance import build_snapshot  # noqa: E402


async def main() -> None:
    if FIXTURE_DIR.exists():
        shutil.rmtree(FIXTURE_DIR)
    HTTP.mode = "record"
    snap = await build_snapshot(set(CATALOG.currencies))
    await HTTP.aclose()
    print(f"recorded {len(list(FIXTURE_DIR.glob('*.json'))) - 1} payloads; observations={len(snap.observations)}")
    for e in snap.errors:
        print("  error:", e.source_id, e.message)


if __name__ == "__main__":
    asyncio.run(main())
