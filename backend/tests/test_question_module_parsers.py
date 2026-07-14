"""Tests for Excel questionnaire parsers (no database required)."""

from pathlib import Path

import pytest

from backend.scripts.question_module_definitions import (
    LEGACY_PF_ID_MAP,
    build_purchase_funnel_module,
)
from backend.scripts.question_module_parsers import (
    PRICING_OPTION_VALUES,
    USAGE_OPTION_VALUES,
    load_workbook_sheets,
    parse_pricing_behavior_sheet,
    parse_usage_sheet,
)

XLSX = Path(__file__).resolve().parents[2] / "Usage Questionnaire for automation (1).xlsx"


@pytest.mark.skipif(not XLSX.is_file(), reason="Excel workbook not present")
def test_parse_usage_sheet_question_counts():
    usage_ws, _ = load_workbook_sheets(XLSX)
    section = parse_usage_sheet(usage_ws)
    assert len(section.questions) == 4
    assert [q.question_id for q in section.questions] == [
        "us_q1",
        "us_q2",
        "us_q3",
        "us_q4",
    ]


@pytest.mark.skipif(not XLSX.is_file(), reason="Excel workbook not present")
def test_usage_specify_flags():
    usage_ws, _ = load_workbook_sheets(XLSX)
    section = parse_usage_sheet(usage_ws)
    q3 = next(q for q in section.questions if q.question_id == "us_q3")
    q4 = next(q for q in section.questions if q.question_id == "us_q4")
    assert any(o.value == "as_needed" and o.allows_specify for o in q3.options)
    assert any(o.value == "when_needed" and o.allows_specify for o in q4.options)


@pytest.mark.skipif(not XLSX.is_file(), reason="Excel workbook not present")
def test_parse_pricing_sheet():
    _, pricing_ws = load_workbook_sheets(XLSX)
    section = parse_pricing_behavior_sheet(pricing_ws)
    assert [q.question_id for q in section.questions] == [
        "cb_q1",
        "cb_q2",
        "cb_q3",
        "cb_q4",
    ]
    cb3 = next(q for q in section.questions if q.question_id == "cb_q3")
    specify = {o.value for o in cb3.options if o.allows_specify}
    assert specify == {"online_other", "other"}


def test_purchase_funnel_pf_ids_and_roles():
    module = build_purchase_funnel_module()
    qids = [q.question_id for s in module.sections for q in s.questions]
    assert qids == [f"pf_q{i}" for i in range(1, 8)]
    roles = [q.analytical_role for s in module.sections for q in s.questions]
    assert roles == [
        "tom",
        "unaided",
        "aided",
        "consideration",
        "bought_12m",
        "bought_3m",
        "mou",
    ]


def test_purchase_funnel_pipeline_remapped_to_pf_ids():
    module = build_purchase_funnel_module()
    pf_q7 = next(
        q
        for s in module.sections
        for q in s.questions
        if q.question_id == "pf_q7"
    )
    assert pf_q7.brand_pipeline is not None
    assert pf_q7.brand_pipeline.sources == ["pf_q6"]
    assert LEGACY_PF_ID_MAP["pb_q3"] == "pf_q6"
