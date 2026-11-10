"""Public API contract (Pydantic). Money is always serialized as decimal strings."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SourceStatus = Literal[
    "live_api", "provider_estimate", "published_tariff", "historical", "user_assumption", "unavailable"
]
Objective = Literal["MOST_RECEIVED", "FASTEST", "WITHIN_DEADLINE"]
RouteType = Literal["conventional_provider", "bank_wire", "usdc"]
InputQuality = Literal["live", "mixed", "assumed"]
RecommendationGrade = Literal["current", "research"]
FeeCategory = Literal[
    "funding", "trading", "conversion", "withdrawal", "network", "deposit", "payout",
    "provider", "intermediary", "receiving", "fx_spread", "implied_spread_impact",
]
Advantage = Literal["cheaper", "faster", "both", "neither", "unavailable"]


def _decimal_str(v: Any) -> str:
    try:
        d = Decimal(str(v))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("must be a decimal number") from exc
    if not d.is_finite():
        raise ValueError("must be finite")
    return str(v)


# --------------------------------------------------------------------------- observations


class Observation(BaseModel):
    source_id: str
    value: str | None = None
    unit: str | None = None
    observed_at: datetime | None = None
    fetched_at: datetime
    expires_at: datetime | None = None
    status: SourceStatus
    provenance_url: str | None = None
    scope: str
    methodology_version: str
    data: dict[str, Any] | None = None
    error: str | None = None


class SourceError(BaseModel):
    source_id: str
    message: str
    at: datetime


class SnapshotMeta(BaseModel):
    id: str
    created_at: datetime
    data_mode: Literal["live", "fixture"]
    observation_count: int
    errors: list[SourceError] = []


# --------------------------------------------------------------------------- results


class Duration(BaseModel):
    min: int | None = None
    typical: int | None = None
    max: int | None = None
    unit: Literal["minutes"] = "minutes"
    known: bool
    note: str | None = None


class FeeItem(BaseModel):
    category: FeeCategory
    label: str
    amount: str
    unit: str
    amount_source: str | None = Field(None, description="Source-currency equivalent at the reference rate")
    source_status: SourceStatus
    source_id: str | None = None
    assumption: bool = False


class LegResult(BaseModel):
    index: int
    kind: str
    label: str
    provider: str
    amount_in: str
    unit_in: str
    amount_out: str
    unit_out: str
    fee: str
    fee_unit: str
    duration: Duration
    schedule: str | None = None
    source_ids: list[str] = []
    source_status: SourceStatus
    observed_at: datetime | None = None
    assumptions: list[str] = []
    detail: dict[str, Any] = {}


class RouteResult(BaseModel):
    id: str
    type: RouteType
    label: str
    provider_steps: list[str]
    network: str | None = None
    source_venue: str | None = None
    destination_venue: str | None = None
    funding_method: str | None = None
    payout_method: str | None = None
    eligible: bool
    exclusion_codes: list[str] = []
    exclusion_reasons: list[str] = []
    recipient_amount: str | None = None
    recipient_currency: str
    total_cost_source: str | None = None
    all_in_cost_pct: str | None = None
    effective_rate: str | None = None
    spread_bps: str | None = None
    duration: Duration
    estimated_arrival: datetime | None = None
    fee_breakdown: list[FeeItem] = []
    legs: list[LegResult] = []
    input_quality: InputQuality = "assumed"
    recommendation_grade: RecommendationGrade = "research"
    source_ids: list[str] = []
    prerequisites: list[str] = []
    risks: list[str] = []


class ReferenceFx(BaseModel):
    rate: str
    unit: str
    base: str
    quote: str
    observed_at: datetime | None
    source_ids: list[str]
    derivation: str
    status: SourceStatus
    cross_check: dict[str, Any] | None = None


# --------------------------------------------------------------------------- requests


# field -> (lower, upper, lower bound exclusive?)
OVERRIDE_BOUNDS: dict[str, tuple[Decimal, Decimal, bool]] = {
    "spread_bps": (Decimal(0), Decimal(5000), False),
    "network_fee_multiplier": (Decimal(0), Decimal(1000), False),
    "depth_multiplier": (Decimal(0), Decimal(1000), True),
    "provider_fee_multiplier": (Decimal(0), Decimal(100), False),
    "payout_delay_hours": (Decimal(0), Decimal(24 * 30), False),
    "funding_delay_hours": (Decimal(0), Decimal(24 * 30), False),
    "bank_fx_spread_bps": (Decimal(0), Decimal(5000), False),
    "max_price_impact_bps": (Decimal(0), Decimal(5000), True),
    "trading_fee_override_pct": (Decimal(0), Decimal(10), False),
}


class Overrides(BaseModel):
    """Counterfactual market assumptions. Any non-default value marks results as simulations."""

    spread_bps: str = Field("0", description="Extra FX spread (bps) applied to every conversion/book")
    network_fee_multiplier: str = "1"
    depth_multiplier: str = "1"
    provider_fee_multiplier: str = "1"
    payout_delay_hours: str = "0"
    funding_delay_hours: str = "0"
    bank_fx_spread_bps: str | None = Field(None, description="Override the bank-wire FX margin assumption")
    max_price_impact_bps: str = Field("100", description="Reject book fills that move price more than this")
    trading_fee_override_pct: str | None = Field(None, description="Override every venue's taker fee (percent)")

    _dec = field_validator(
        "spread_bps", "network_fee_multiplier", "depth_multiplier", "provider_fee_multiplier",
        "payout_delay_hours", "funding_delay_hours", "max_price_impact_bps",
    )(_decimal_str)

    @field_validator("bank_fx_spread_bps", "trading_fee_override_pct")
    @classmethod
    def _opt(cls, v: str | None) -> str | None:
        return None if v in (None, "") else _decimal_str(v)

    @model_validator(mode="after")
    def _bounds(self) -> Overrides:
        # Out-of-range stresses produce nonsense (negative fees create money, negative delays travel back in time,
        # negative depth flips book quantities), so each knob is held to a physically meaningful range.
        for name, (lo, hi, lo_open) in OVERRIDE_BOUNDS.items():
            raw = getattr(self, name)
            if raw is None:
                continue
            v = Decimal(raw)
            if (v <= lo if lo_open else v < lo) or v > hi:
                raise ValueError(f"{name} must be {'>' if lo_open else '≥'} {lo} and ≤ {hi} (got {raw})")
        return self

    def is_default(self) -> bool:
        return self == Overrides()


class ComparisonRequest(BaseModel):
    source_country: str = Field(..., min_length=2, max_length=2)
    source_currency: str = Field(..., min_length=3, max_length=3)
    destination_country: str = Field(..., min_length=2, max_length=2)
    destination_currency: str = Field(..., min_length=3, max_length=3)
    send_amount: str
    funding_method: str = "any_bank"
    payout_method: str = "any_bank"
    objective: Objective = "MOST_RECEIVED"
    deadline_minutes: int | None = Field(None, ge=1, le=60 * 24 * 30)
    mode: Literal["current"] = "current"
    start_time: datetime | None = Field(None, description="When the sender starts funding (defaults to now)")
    overrides: Overrides = Field(default_factory=Overrides)

    _amt = field_validator("send_amount")(_decimal_str)


class AmountRange(BaseModel):
    min: str
    max: str
    steps: int = Field(24, ge=2, le=40)
    scale: Literal["log", "linear"] = "log"

    _dec = field_validator("min", "max")(_decimal_str)


HeatmapAxis = Literal["network_fee_multiplier", "spread_bps", "depth_multiplier", "payout_delay_hours",
                      "provider_fee_multiplier"]


class SensitivityRequest(BaseModel):
    baseline: ComparisonRequest
    amounts: list[str] | None = Field(None, max_length=40)
    amount_range: AmountRange | None = None
    heatmap_axis: HeatmapAxis | None = "network_fee_multiplier"
    heatmap_values: list[str] | None = Field(None, max_length=10)
    heatmap_amounts: list[str] | None = Field(None, max_length=10)


# --------------------------------------------------------------------------- responses


class ComparisonResponse(BaseModel):
    id: str
    created_at: datetime
    model_version: str
    catalog_version: str
    request: ComparisonRequest
    snapshot: SnapshotMeta
    reference_fx: ReferenceFx | None
    routes: list[RouteResult]
    excluded: list[RouteResult]
    recommended_route_id: str | None
    recommendation_reason: str
    recommendation_grade: RecommendationGrade | None
    most_received_route_id: str | None
    fastest_route_id: str | None
    pareto_route_ids: list[str]
    is_simulation_override: bool
    source_errors: list[SourceError]
    warnings: list[str]
    disclaimer: str


class SeriesPoint(BaseModel):
    amount: str
    route_id: str | None
    label: str | None
    recipient_amount: str | None
    all_in_cost_pct: str | None
    typical_minutes: int | None
    eligible: bool


class Series(BaseModel):
    key: str
    label: str
    points: list[SeriesPoint]


class Crossover(BaseModel):
    metric: Literal["cost", "time"]
    amount: str
    between: list[str]
    description: str


class HeatmapCell(BaseModel):
    amount: str
    axis_value: str
    classification: Advantage
    cost_advantage_pct: str | None
    time_advantage_minutes: int | None
    best_usdc_route_id: str | None
    best_conventional_route_id: str | None


class SensitivityResponse(BaseModel):
    id: str
    created_at: datetime
    model_version: str
    request: SensitivityRequest
    snapshot: SnapshotMeta
    amounts: list[str]
    series: list[Series]
    crossovers: list[Crossover]
    no_crossover_note: str | None
    heatmap_axis: HeatmapAxis | None
    heatmap_values: list[str]
    heatmap_amounts: list[str]
    heatmap: list[HeatmapCell]
    points_computed: int
    is_simulation: bool
    disclaimer: str


class ScenarioCreate(BaseModel):
    comparison_id: str
    sensitivity_id: str | None = None
    label: str | None = Field(None, max_length=120)


class ScenarioOut(BaseModel):
    id: str
    created_at: datetime
    label: str | None
    share_path: str
    comparison: ComparisonResponse
    sensitivity: SensitivityResponse | None
    replay_note: str
