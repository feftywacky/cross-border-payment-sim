"""CSV/JSON export of a scenario's comparison and sensitivity results, with provenance columns."""

from __future__ import annotations

import csv
import io

from app.schemas import ComparisonResponse, SensitivityResponse

COLUMNS = [
    "section", "scenario_id", "snapshot_id", "model_version", "catalog_version", "route_id", "route_type", "label",
    "eligible", "exclusion_codes", "exclusion_reasons", "send_amount", "source_currency", "recipient_amount",
    "recipient_currency", "total_cost_source", "all_in_cost_pct", "effective_rate", "spread_bps",
    "duration_min", "duration_typical", "duration_max", "duration_known", "input_quality", "recommendation_grade",
    "fee_category", "fee_label", "fee_amount", "fee_unit", "fee_amount_source", "fee_source_status",
    "fee_assumption", "axis", "axis_value", "classification", "source_ids", "reference_rate", "reference_observed_at",
]


def to_csv(scenario_id: str, comp: ComparisonResponse, sens: SensitivityResponse | None) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, extrasaction="ignore")
    w.writeheader()
    base = {"scenario_id": scenario_id, "snapshot_id": comp.snapshot.id, "model_version": comp.model_version,
            "catalog_version": comp.catalog_version, "send_amount": comp.request.send_amount,
            "source_currency": comp.request.source_currency,
            "reference_rate": comp.reference_fx.rate if comp.reference_fx else "",
            "reference_observed_at": comp.reference_fx.observed_at if comp.reference_fx else ""}
    for r in [*comp.routes, *comp.excluded]:
        row = {**base, "section": "route", "route_id": r.id, "route_type": r.type, "label": r.label,
               "eligible": r.eligible, "exclusion_codes": ";".join(r.exclusion_codes),
               "exclusion_reasons": " | ".join(r.exclusion_reasons), "recipient_amount": r.recipient_amount,
               "recipient_currency": r.recipient_currency, "total_cost_source": r.total_cost_source,
               "all_in_cost_pct": r.all_in_cost_pct, "effective_rate": r.effective_rate, "spread_bps": r.spread_bps,
               "duration_min": r.duration.min, "duration_typical": r.duration.typical, "duration_max": r.duration.max,
               "duration_known": r.duration.known, "input_quality": r.input_quality,
               "recommendation_grade": r.recommendation_grade, "source_ids": ";".join(r.source_ids)}
        w.writerow(row)
        for f in r.fee_breakdown:
            w.writerow({**base, "section": "fee", "route_id": r.id, "fee_category": f.category, "fee_label": f.label,
                        "fee_amount": f.amount, "fee_unit": f.unit, "fee_amount_source": f.amount_source,
                        "fee_source_status": f.source_status, "fee_assumption": f.assumption,
                        "source_ids": f.source_id or ""})
    if sens:
        sbase = {**base, "snapshot_id": sens.snapshot.id}
        for series in sens.series:
            for p in series.points:
                w.writerow({**sbase, "section": f"sweep:{series.key}", "send_amount": p.amount, "route_id": p.route_id,
                            "label": p.label, "eligible": p.eligible, "recipient_amount": p.recipient_amount,
                            "all_in_cost_pct": p.all_in_cost_pct, "duration_typical": p.typical_minutes})
        for c in sens.heatmap:
            w.writerow({**sbase, "section": "heatmap", "send_amount": c.amount, "axis": sens.heatmap_axis,
                        "axis_value": c.axis_value, "classification": c.classification,
                        "all_in_cost_pct": c.cost_advantage_pct, "duration_typical": c.time_advantage_minutes,
                        "route_id": c.best_usdc_route_id})
        for x in sens.crossovers:
            w.writerow({**sbase, "section": f"crossover:{x.metric}", "send_amount": x.amount, "label": x.description})
    return buf.getvalue()
