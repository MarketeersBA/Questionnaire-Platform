from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.render_mode import (
    PPTXRenderMode,
    resolve_render_mode,
)
from backend.analytics_module.pptx_builder.validation_gating import PPTXValidationMode
from backend.tests.analytics.pptx_acceptance_contract import (
    build_protein_bar_screen_report,
    build_representative_screen_report,
)
from backend.tests.analytics.pptx_e2e_coverage import (
    build_per_chart_coverage_report,
    format_coverage_report_markdown,
    run_native_e2e_export,
    write_coverage_artifacts,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ARTIFACT_DIR = REPO_ROOT / "backend" / "tests" / "analytics" / "artifacts" / "pptx_e2e"


@pytest.fixture
def native_render_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PPTX_RENDER_MODE", "native")
    assert resolve_render_mode().value == PPTXRenderMode.NATIVE.value


@pytest.fixture(scope="session")
def protein_bar_taste_test_report() -> dict:
    return build_protein_bar_screen_report()


@pytest.fixture(scope="session")
def representative_taste_test_report() -> dict:
    return build_representative_screen_report()


def _maybe_write_artifacts(
    export_result,
    coverage_report: dict,
    *,
    fixture_name: str,
) -> None:
    if os.environ.get("PPTX_E2E_WRITE_ARTIFACT", "").strip().lower() not in {"1", "true", "yes"}:
        return
    output_dir = Path(os.environ.get("PPTX_E2E_ARTIFACT_DIR", str(DEFAULT_ARTIFACT_DIR))) / fixture_name
    write_coverage_artifacts(
        coverage_report,
        output_dir=output_dir,
        deck_bytes=export_result.pptx_stream.getvalue(),
        deck_filename=f"{fixture_name}_native_e2e.pptx",
    )


@pytest.mark.asyncio
async def test_native_e2e_protein_bar_survey_production_gate(
    native_render_mode,
    marketeers_template_path,
    protein_bar_taste_test_report,
):
    """Phase F: full taste-test screen export with native mode and PRODUCTION validator."""
    export_result = await run_native_e2e_export(
        protein_bar_taste_test_report,
        template_path=marketeers_template_path,
        render_mode="native",
    )
    coverage = build_per_chart_coverage_report(export_result)

    assert export_result.render_mode == "native"
    assert export_result.validation["validation_mode"] == PPTXValidationMode.PRODUCTION.value
    assert export_result.validation["passes_gate"] is True
    assert coverage["summary"]["all_charts_passed"] is True
    assert coverage["failed_chart_count"] == 0
    assert coverage["passed_chart_count"] == coverage["chart_count"]
    assert coverage["summary"]["unsupported_count"] == 0
    assert coverage["summary"]["error_placeholder_count"] == 0
    assert export_result.validation["render_tally"]["native_render_count"] > 0
    assert export_result.validation["render_tally"]["image_capture_count"] == 0

    for row in coverage["rows"]:
        assert row["uses_fallback_table"] is False, row
        assert row["render_mode"] != "image_capture", row
        assert row["numeric_evidence"] is True, row
        assert row["passed"] is True, row

    markdown = format_coverage_report_markdown(coverage)
    assert "PRODUCTION gate: **PASS**" in markdown
    _maybe_write_artifacts(export_result, coverage, fixture_name="protein_bar")


@pytest.mark.asyncio
async def test_native_e2e_representative_screen_production_gate(
    native_render_mode,
    marketeers_template_path,
    representative_taste_test_report,
):
    export_result = await run_native_e2e_export(
        representative_taste_test_report,
        template_path=marketeers_template_path,
        render_mode="native",
    )
    coverage = build_per_chart_coverage_report(export_result)

    assert export_result.validation["passes_gate"] is True
    assert coverage["summary"]["all_charts_passed"] is True
    assert coverage["adjusted_chart_parity"]["missing_from_pptx"] == []

    _maybe_write_artifacts(export_result, coverage, fixture_name="representative_screen")


def test_native_render_mode_env_defaults_to_native(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PPTX_RENDER_MODE", raising=False)
    assert resolve_render_mode().value == PPTXRenderMode.NATIVE.value

    monkeypatch.setenv("PPTX_RENDER_MODE", "native")
    assert resolve_render_mode().value == PPTXRenderMode.NATIVE.value


@pytest.mark.asyncio
async def test_native_e2e_coverage_report_contract_registry_complete(
    native_render_mode,
    marketeers_template_path,
    protein_bar_taste_test_report,
):
    export_result = await run_native_e2e_export(
        protein_bar_taste_test_report,
        template_path=marketeers_template_path,
    )
    coverage = build_per_chart_coverage_report(export_result)

    assert coverage["contract_registry_count"] >= 20
    matched_patterns = {row["contract_pattern"] for row in coverage["rows"] if row["contract_pattern"]}
    assert "criteria_table" in matched_patterns
    assert "brand_card_*" in matched_patterns
    assert "open_end_*" in matched_patterns
