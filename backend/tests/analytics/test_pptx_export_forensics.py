from pathlib import Path

from backend.analytics_module.pptx_builder.chart_fidelity_matrix import (
    PROTEIN_BAR_SURVEY_ID,
    build_chart_fidelity_matrix,
    expected_registry_key,
)
from backend.analytics_module.pptx_builder.chart_payload_contract import prepare_report_for_pptx
from backend.analytics_module.pptx_builder.insight_payload_contract import normalize_insights_for_pptx
from backend.analytics_module.pptx_builder.pptx_export_audit import audit_pptx_path, compact_export_audit
from backend.analytics_module.pptx_builder.pptx_export_forensics import build_export_forensics_manifest
from backend.tests.analytics.pptx_acceptance_contract import build_representative_screen_report

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_chart_fidelity_matrix_matches_representative_screen_report():
    report = build_representative_screen_report()
    matrix = build_chart_fidelity_matrix(report)

    assert len(matrix) == len(report["charts"])
    assert {row["chart_id"] for row in matrix} == {chart["chart_id"] for chart in report["charts"]}
    assert all(row["expected_registry_key"] for row in matrix)


def test_prepare_report_for_pptx_builds_fidelity_and_forensics_manifest():
    report = build_representative_screen_report()
    preparation = prepare_report_for_pptx(report)
    prepared_report = preparation.report_doc
    fidelity = build_chart_fidelity_matrix(prepared_report)

    forensics = build_export_forensics_manifest(
        report_doc=prepared_report,
        intents=[],
        preparation_snapshot=preparation.snapshot,
        normalization_notes=preparation.normalization_notes,
        render_journal=[],
        narrative_journal=[],
        certification={"passes_gate": False, "export_audit": {"text_markers": {}, "slide_summaries": []}},
    )

    assert forensics["chart_fidelity_matrix"]
    assert len(forensics["chart_forensics"]) == len(fidelity)
    assert forensics["blocked_chart_count"] == len(fidelity)
    assert PROTEIN_BAR_SURVEY_ID == "69ce229eeed39ea9d5282afa"


def test_expected_registry_key_honors_chart_id_overrides():
    assert expected_registry_key({"chart_id": "brand_awareness", "chart_type": "horizontal_bar"}) == "brand_awareness"
    assert expected_registry_key({"chart_id": "sigma_intent", "chart_type": "sigma_intent_scatter"}) == "sigma_intent"


def test_normalize_insights_for_pptx_aliases_persisted_keys():
    report = {
        "insights": {
            "summary": "Executive narrative",
            "findings": [{"label": "Taste", "finding": "Leads category"}],
            "competitive_narrative": {"market_position": "Leader"},
            "opportunities": [{"title": "Defend taste"}],
        }
    }

    normalize_insights_for_pptx(report)

    insights = report["insights"]
    assert insights["executive_summary"] == "Executive narrative"
    assert insights["key_findings"] == insights["findings"]
    assert insights["market_position_report"] == insights["competitive_narrative"]
    assert insights["opportunity_insights"] == insights["opportunities"]


def test_protein_bar_bad_deck_exposes_error_placeholders():
    bad_deck_path = REPO_ROOT / "report_69ce229eeed39ea9d5282afa (15).pptx"
    if not bad_deck_path.is_file():
        return

    audit = compact_export_audit(audit_pptx_path(bad_deck_path))
    assert audit["error_placeholder_count"] > 0
    assert audit["text_markers"]["analysis_interrupted"] > 0
    assert audit["text_markers"]["executive_summary"] == 0
