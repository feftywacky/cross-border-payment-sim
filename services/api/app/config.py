"""Runtime settings from environment variables. Secrets stay server-side and are never serialized."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

MODEL_VERSION = "route-engine/1.0.0"


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass
class Settings:
    data_mode: str = field(default_factory=lambda: _env("DATA_MODE", "live"))  # live | fixture | record
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./data/sim.db"))
    cors_origins: list[str] = field(
        default_factory=lambda: (_env("CORS_ORIGINS", "http://localhost:3000") or "").split(",")
    )
    http_timeout_s: float = field(default_factory=lambda: float(_env("HTTP_TIMEOUT_S", "6")))
    book_ttl_s: float = 15.0
    network_ttl_s: float = 30.0
    fx_ttl_s: float = 3600.0
    book_expiry_s: int = 60  # an executable-price observation older than this is stale for "current" mode
    rate_limit_per_minute: int = field(default_factory=lambda: int(_env("RATE_LIMIT_PER_MINUTE", "60")))
    wise_api_token: str | None = field(default_factory=lambda: _env("WISE_API_TOKEN"))
    wise_api_base: str = field(default_factory=lambda: _env("WISE_API_BASE", "https://api.wise.com"))
    max_sensitivity_points: int = 100

    def rpc_url(self, env_name: str | None, default: str | None) -> str | None:
        return _env(env_name, default) if env_name else default


settings = Settings()
