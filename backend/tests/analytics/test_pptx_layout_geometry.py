from pathlib import Path

import pytest
from pptx import Presentation
from pptx.util import Inches

from backend.analytics_module.pptx_builder.layout import (
    PPTXLayout,
    REFERENCE_HEIGHT_EMU,
    REFERENCE_WIDTH_EMU,
)

TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "analytics"
    / "marketeers_template.pptx"
)


@pytest.fixture
def marketeers_presentation():
    if not TEMPLATE_PATH.is_file():
        pytest.skip(f"Marketeers template not found at {TEMPLATE_PATH}")
    return Presentation(str(TEMPLATE_PATH))


def test_marketeers_template_matches_reference_canvas(marketeers_presentation):
    prs = marketeers_presentation
    assert prs.slide_width == REFERENCE_WIDTH_EMU
    assert prs.slide_height == REFERENCE_HEIGHT_EMU


def test_layout_from_marketeers_template_chart_frame_within_bounds(marketeers_presentation):
    layout = PPTXLayout.from_presentation(marketeers_presentation)
    assert layout.chart_frame_fits_slide()

    left, top, width, height = layout.chart_frame_bounds()
    assert int(left) >= 0
    assert int(top) >= 0
    assert int(left) + int(width) <= layout.slide_width_emu
    assert int(top) + int(height) <= layout.slide_height_emu


def test_layout_geometry_manifest_matches_frame_and_body(marketeers_presentation):
    layout = PPTXLayout.from_presentation(marketeers_presentation)
    manifest = layout.geometry_manifest()

    frame_left, frame_top, frame_width, frame_height = layout.chart_frame_bounds()
    body_left, body_top, body_width, body_height = layout.chart_body_bounds()

    assert manifest["chart_frame_fits_slide"] is True
    assert manifest["chart_frame"] == {
        "left": int(frame_left),
        "top": int(frame_top),
        "width": int(frame_width),
        "height": int(frame_height),
    }
    assert manifest["chart_body"] == {
        "left": int(body_left),
        "top": int(body_top),
        "width": int(body_width),
        "height": int(body_height),
    }
    assert layout.shape_fits_slide(
        manifest["chart_body"]["left"],
        manifest["chart_body"]["top"],
        manifest["chart_body"]["width"],
        manifest["chart_body"]["height"],
    )


def test_shape_fits_slide_rejects_out_of_bounds():
    layout = PPTXLayout.for_reference()
    assert layout.shape_fits_slide(0, 0, layout.slide_width_emu, layout.slide_height_emu) is True
    assert layout.shape_fits_slide(-1, 0, 10, 10) is False
    assert layout.shape_fits_slide(0, 0, layout.slide_width_emu + 1, 10) is False


def test_layout_scales_for_blank_widescreen_fallback():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    layout = PPTXLayout.from_presentation(prs)
    assert layout.chart_frame_fits_slide()
    assert layout.slide_width_emu == int(13.333 * 914400)
    assert layout.slide_height_emu == int(7.5 * 914400)
