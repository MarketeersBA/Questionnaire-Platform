"""Phase 9 — seed script QA contracts (no database)."""

from pathlib import Path

import pytest

from backend.scripts.question_module_definitions import (
    build_brand_pricing_behavior_module,
    build_brand_usage_module,
    build_purchase_funnel_module,
)
from backend.scripts.question_module_parsers import (
    load_workbook_sheets,
    parse_pricing_behavior_sheet,
    parse_usage_sheet,
)
from backend.utils.module_qa_contracts import (
    EXPECTED_MODULE_QUESTION_COUNTS,
    validate_all_seed_modules,
)

XLSX = Path(__file__).resolve().parents[2] / "Usage Questionnaire for automation (1).xlsx"


def test_purchase_funnel_seed_contract_without_excel():
    pf = build_purchase_funnel_module()
    assert len([q for s in pf.sections for q in s.questions]) == EXPECTED_MODULE_QUESTION_COUNTS["purchase_funnel"]


@pytest.mark.skipif(not XLSX.is_file(), reason="Excel workbook not present")
def test_full_seed_contract_from_excel():
    pf = build_purchase_funnel_module()
    usage_ws, pricing_ws = load_workbook_sheets(XLSX)
    usage = build_brand_usage_module(parse_usage_sheet(usage_ws))
    pricing = build_brand_pricing_behavior_module(parse_pricing_behavior_sheet(pricing_ws))

    summary = validate_all_seed_modules(pf, usage, pricing)
    assert summary["purchase_funnel"]["question_count"] == 7
    assert summary["brand_usage"]["question_count"] == 4
    assert summary["brand_pricing_behavior"]["question_count"] == 4
    assert "as_needed" in summary["brand_usage"]["specify_options"]
    assert "online_other" in summary["brand_pricing_behavior"]["specify_options"]
