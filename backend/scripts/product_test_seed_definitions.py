"""
Product Test bank seed — paths, fixture fallback, and load helpers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XLSX = REPO_ROOT / "General_Product_Test_Evaluation.xlsx"
FIXTURE_JSON = Path(__file__).resolve().parent.parent / "data" / "product_test" / "bank_fixture.json"


def resolve_xlsx_path(override: str | None = None) -> Path:
    return Path(override) if override else DEFAULT_XLSX


def load_fixture_bank() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Load embedded dev fixture when Excel workbook is unavailable."""
    if not FIXTURE_JSON.is_file():
        raise FileNotFoundError(f"Fixture bank not found: {FIXTURE_JSON}")

    with FIXTURE_JSON.open(encoding="utf-8") as f:
        payload = json.load(f)

    product = payload.get("product_questions", [])
    package = payload.get("package_questions", [])
    if not product:
        raise ValueError(f"Fixture {FIXTURE_JSON} has no product_questions")
    return product, package


def summarize_bank(product: List[Dict[str, Any]], package: List[Dict[str, Any]]) -> Dict[str, int]:
    fixed = sum(1 for q in product if q.get("question_status") == "fixed")
    optional = sum(1 for q in product if q.get("question_status") == "optional")
    pkg_fixed = sum(1 for q in package if q.get("question_status") == "fixed")
    return {
        "product_count": len(product),
        "package_count": len(package),
        "fixed_count": fixed,
        "optional_count": optional,
        "package_fixed_count": pkg_fixed,
    }
