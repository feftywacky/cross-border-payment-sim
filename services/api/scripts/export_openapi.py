"""Print the OpenAPI schema (consumed by packages/contracts to generate TypeScript types)."""

import json
import os

os.environ.setdefault("DATA_MODE", "fixture")

from app.main import app  # noqa: E402

print(json.dumps(app.openapi(), indent=1, sort_keys=True))
