"""
Phase 5 — Regenerate ice-cream survey report and verify NPS gauge + brand-card parity.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bson import ObjectId
from fastapi import BackgroundTasks

from backend.database import db
from backend.services.analytics_service import analytics_service

SURVEY_ID = "6a4b858261f51908cc98195c"
EXPECTED_BRANDS = {"Friday", "Squizz"}


class _UserMock:
    id = ObjectId("000000000000000000000001")
    username = "admin"
    role = "admin"


def _find_chart(charts: list, chart_id: str) -> dict | None:
    for chart in charts or []:
        if chart.get("chart_id") == chart_id:
            return chart
    return None


def _brand_card_nps(charts: list) -> dict[str, int | None]:
    out: dict[str, int | None] = {}
    for chart in charts or []:
        if chart.get("chart_type") != "scorecard":
            continue
        profile = (chart.get("data") or {}).get("profile") or {}
        brand = profile.get("Brand")
        if not brand:
            continue
        nps = profile.get("NPS")
        out[str(brand)] = int(nps) if nps is not None else None
    return out


def _verify_nps_gauge(chart: dict) -> dict:
    data = chart.get("data") or {}
    labels = data.get("labels") or []
    datasets = data.get("datasets") or []
    nps_scores = data.get("nps_scores") or {}

    segment_map = {
        str(ds.get("label", "")): list(ds.get("data") or [])
        for ds in datasets
        if isinstance(ds, dict)
    }

    rows = []
    for index, brand in enumerate(labels):
        rows.append(
            {
                "brand": brand,
                "detractors": segment_map.get("Detractors", [None] * len(labels))[index],
                "passives": segment_map.get("Passives", [None] * len(labels))[index],
                "promoters": segment_map.get("Promoters", [None] * len(labels))[index],
                "nps": nps_scores.get(brand),
            }
        )

    return {
        "chart_id": chart.get("chart_id"),
        "labels": labels,
        "nps_scores": nps_scores,
        "rows": rows,
        "has_real_segments": any(
            (row["detractors"] or 0) > 0 or (row["passives"] or 0) > 0 or (row["promoters"] or 0) > 0
            for row in rows
        ),
        "all_nps_present": all(row["nps"] is not None for row in rows),
    }


async def main() -> int:
    db.connect()
    bg_tasks = BackgroundTasks()
    user = _UserMock()

    print(f"Regenerating report for survey {SURVEY_ID} ...")
    try:
        await analytics_service.generate_survey_report(
            survey_id=SURVEY_ID,
            background_tasks=bg_tasks,
            current_user=user,
            force=True,
        )
        await analytics_service._run_analysis_task(SURVEY_ID, options={}, force=True)
    except Exception as exc:
        print(f"FAILED to regenerate report: {exc}")
        import traceback

        traceback.print_exc()
        db.close()
        return 1

    report = await db.get_collection("survey_reports").find_one({"survey_id": SURVEY_ID})
    if not report:
        print("ERROR: report document missing after regeneration")
        db.close()
        return 1

    charts = report.get("charts") or []
    gauge_chart = _find_chart(charts, "nps_recommend")
    if not gauge_chart:
        print("ERROR: nps_recommend chart missing from report")
        db.close()
        return 1

    gauge = _verify_nps_gauge(gauge_chart)
    cards = _brand_card_nps(charts)

    print("\n=== NPS Gauge (canonical payload) ===")
    print(json.dumps(gauge, indent=2, default=str))

    print("\n=== Brand-card NPS ===")
    print(json.dumps(cards, indent=2, default=str))

    errors: list[str] = []
    gauge_brands = set(gauge["labels"])
    if not EXPECTED_BRANDS.issubset(gauge_brands):
        errors.append(f"Expected brands {EXPECTED_BRANDS}, got gauge labels {gauge_brands}")

    if not gauge["has_real_segments"]:
        errors.append("Gauge segments are all zero — no real Detractors/Passives/Promoters data")

    if not gauge["all_nps_present"]:
        errors.append("One or more brands missing nps_scores on gauge chart")

    for brand in EXPECTED_BRANDS:
        if brand not in cards:
            errors.append(f"Brand card missing for {brand}")
            continue
        if cards[brand] is None:
            errors.append(f"Brand card NPS missing for {brand}")
            continue
        if brand not in gauge["nps_scores"]:
            errors.append(f"Gauge nps_scores missing for {brand}")
            continue
        if cards[brand] != gauge["nps_scores"][brand]:
            errors.append(
                f"NPS mismatch for {brand}: card={cards[brand]} gauge={gauge['nps_scores'][brand]}"
            )

    if errors:
        print("\nVERIFICATION FAILED:")
        for err in errors:
            print(f"  - {err}")
        db.close()
        return 1

    print("\nVERIFICATION PASSED")
    print("  - Gauge has real segment fractions per brand")
    print("  - Brand-card NPS matches gauge nps_scores for Friday and Squizz")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
