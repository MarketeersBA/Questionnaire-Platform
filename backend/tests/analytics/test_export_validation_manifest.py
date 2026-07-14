from backend.analytics_module.pptx_builder.export_validation_manifest import (
    build_export_manifest,
    divider_title_allowance,
    summarize_render_journal,
)
from backend.analytics_module.pptx_builder.presentation_planner import SlideIntent, SlideType


def test_summarize_render_journal_counts_statuses():
    tally = summarize_render_journal(
        [
            {"render_status": "rendered"},
            {"render_status": "rendered"},
            {"render_status": "failed"},
            {"render_status": "skipped_empty_data"},
        ]
    )

    assert tally == {
        "rendered_chart_count": 2,
        "failed_chart_count": 1,
        "skipped_empty_data_count": 1,
        "image_capture_count": 0,
        "native_render_count": 4,
    }


def test_divider_title_allowance_counts_section_dividers():
    intents = [
        SlideIntent(SlideType.SECTION_DIVIDER, title="Brand Awareness"),
        SlideIntent(SlideType.SECTION_DIVIDER, title="Brand Awareness"),
        SlideIntent(SlideType.CONTENT_SLIDE, data={"chart_type": "horizontal_bar"}),
    ]

    assert divider_title_allowance(intents) == {"BRAND AWARENESS": 2}


def test_build_export_manifest_includes_validation_tallies():
    manifest = build_export_manifest(
        report_id="abc123",
        generated_at="2026-05-13T12:00:00",
        template_hash="hash",
        certification={
            "validation_mode": "production",
            "passes_gate": False,
            "slide_count": 12,
            "unsupported_count": 1,
            "error_placeholder_count": 2,
            "duplicate_title_count": 0,
            "layout_warning_count": 1,
            "layout_warnings": [{"slide_index": 3}],
            "missing_narrative_sections": [{"section_id": "executive_summary"}],
            "validation_errors": ["Error placeholder detected on slide 2."],
            "validation_warnings": ["Shape 1 on slide 3 extends outside the slide canvas."],
            "render_tally": {
                "rendered_chart_count": 8,
                "failed_chart_count": 1,
                "skipped_empty_data_count": 1,
            },
            "export_audit": {"notes_count": 4},
        },
        report_doc={"charts": [{"chart_id": "a"}, {"chart_id": "b"}]},
        preparation_snapshot={"charts": []},
        chart_normalization_notes=[],
        chart_parity={"order_mismatch": False},
        narrative_render_manifest={"missing_sections": []},
        layout_geometry={"chart_frame_fits_slide": True},
        actual_slide_count=12,
    )

    assert manifest["total_slides"] == 12
    assert manifest["rendered_chart_count"] == 8
    assert manifest["failed_chart_count"] == 1
    assert manifest["notes_count"] == 4
    assert manifest["missing_narrative_sections"][0]["section_id"] == "executive_summary"
    assert manifest["validation_errors"] == ["Error placeholder detected on slide 2."]
