"""Unit tests for PPTX brand profile card KPI grid helpers."""

import pytest

from backend.analytics_module.pptx_builder.pptx_brand_profile_card import PPTXBrandProfileCard
from backend.analytics_module.pptx_builder.theme import PPTXTheme


@pytest.fixture
def theme():
    return PPTXTheme()


def test_resolve_kpi_tiles_without_nps_returns_three_tiles():
    profile = {
        "Brand": "Hero Brand",
        "Overall Score": 8.1,
        "T2B %": 64,
        "Evaluations": 412,
    }
    tiles = PPTXBrandProfileCard._resolve_kpi_tiles(profile)

    assert len(tiles) == 3
    assert [tile.label for tile in tiles] == ["OVERALL SCORE", "T2B %", "EVALUATIONS"]
    assert tiles[0].value == "8.1"
    assert tiles[1].value == "64%"
    assert tiles[2].value == "412"


def test_resolve_kpi_tiles_with_nps_inserts_signed_score_after_t2b():
    profile = {
        "Brand": "Hero Brand",
        "Overall Score": 8.1,
        "T2B %": 64,
        "NPS": 30,
        "Evaluations": 412,
    }
    tiles = PPTXBrandProfileCard._resolve_kpi_tiles(profile)

    assert len(tiles) == 4
    assert [tile.label for tile in tiles] == ["OVERALL SCORE", "T2B %", "NPS", "EVALUATIONS"]
    assert tiles[2].value == "+30"
    assert tiles[2].descriptor == "Net Promoter Score"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (30, "+30"),
        (-10, "-10"),
        (0, "0"),
        (30.4, "+30"),
    ],
)
def test_format_signed_nps(value, expected):
    assert PPTXBrandProfileCard._format_signed_nps(value) == expected


def test_compute_kpi_grid_layout_fits_four_tiles_before_sidebar():
    start_left, card_w, spacing, card_h = PPTXBrandProfileCard._compute_kpi_grid_layout(4)

    assert start_left == pytest.approx(0.5)
    assert spacing == pytest.approx(0.3)
    assert card_h == pytest.approx(3.2)
    assert card_w == pytest.approx(2.1)
    total_width = card_w * 4 + spacing * 3
    assert start_left + total_width == pytest.approx(9.8)


def test_compute_kpi_grid_layout_widens_cards_for_three_tiles():
    _, card_w_three, _, _ = PPTXBrandProfileCard._compute_kpi_grid_layout(3)
    _, card_w_four, _, _ = PPTXBrandProfileCard._compute_kpi_grid_layout(4)

    assert card_w_three == pytest.approx(2.9)
    assert card_w_three > card_w_four


def test_brand_profile_card_render_with_nps(marketeers_presentation, marketeers_layout, theme):
    builder = PPTXBrandProfileCard(theme, marketeers_layout)
    context = {
        "brand_data": {
            "data": {
                "profile": {
                    "Brand": "Hero Brand",
                    "Overall Score": 8.1,
                    "T2B %": 64,
                    "NPS": -12,
                    "Evaluations": 412,
                },
                "strengths": [{"attribute": "Taste", "score": 8.5}],
            }
        },
        "ai_insight": "Hero brand leads on taste.",
        "brand_index": 1,
        "total_brands": 3,
    }
    slide = marketeers_presentation.slides.add_slide(marketeers_presentation.slide_layouts[1])
    builder.render(slide, context)
    assert len(slide.shapes) > 0
