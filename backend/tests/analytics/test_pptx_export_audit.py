from pathlib import Path

import pytest

from backend.analytics_module.pptx_builder.pptx_export_audit import (
    audit_pptx_bytes,
    audit_pptx_path,
    compact_export_audit,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FAILING_FIXTURE = REPO_ROOT / "report_69ce229eeed39ea9d5282afa (14).pptx"


@pytest.fixture(scope="module")
def failing_fixture_audit() -> dict:
    if not FAILING_FIXTURE.is_file():
        pytest.skip(f"Diagnosis fixture missing: {FAILING_FIXTURE}")
    return audit_pptx_path(FAILING_FIXTURE)


def test_audit_path_and_bytes_match(failing_fixture_audit):
    audit_from_bytes = audit_pptx_bytes(FAILING_FIXTURE.read_bytes())
    assert compact_export_audit(audit_from_bytes) == compact_export_audit(failing_fixture_audit)


def test_failing_fixture_reports_expected_structure(failing_fixture_audit):
    audit = compact_export_audit(failing_fixture_audit)

    assert audit["slide_count"] == 27
    assert audit["chart_part_count"] == 10
    assert audit["embedded_excel_count"] == 10
    assert audit["notes_count"] == 0
    assert audit["presentation_readable"] is True
    assert audit["error_placeholder_count"] >= 5
    assert audit["layout_warning_count"] > 0
    assert isinstance(audit["duplicate_titles"], list)
    assert len(audit["slide_titles"]) > 0
    assert len(audit["slide_summaries"]) == audit["slide_count"]


def test_failing_fixture_text_markers(failing_fixture_audit):
    markers = failing_fixture_audit["text_markers"]

    assert markers["analysis_interrupted"] >= 5
    assert markers["executive_summary"] == 0
    assert markers["insight"] == 0


def test_compact_audit_omits_geometry_issue_objects(failing_fixture_audit):
    compact = compact_export_audit(failing_fixture_audit)

    assert "geometry_issues" not in compact
    assert "layout_warnings" not in compact
    assert compact["out_of_bounds_shape_count"] == failing_fixture_audit["out_of_bounds_shape_count"]
