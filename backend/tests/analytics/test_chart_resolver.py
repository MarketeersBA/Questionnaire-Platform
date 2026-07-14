from backend.analytics_module.pptx_builder.chart_resolver import PPTXChartResolver
from backend.analytics_module.pptx_builder.pptx_generic_table import PPTXGenericTable
from backend.analytics_module.pptx_builder.pptx_waterfall_bar import PPTXWaterfallBar
from backend.analytics_module.pptx_builder.pptx_snake_line import PPTXSnakeLine
from backend.analytics_module.pptx_builder.pptx_scatter import PPTXScatter
from backend.analytics_module.pptx_builder.pptx_radar import PPTXRadar


def test_brand_awareness_chart_id_override_wins_over_horizontal_bar():
    resolver = PPTXChartResolver()
    resolution = resolver.resolve(
        {
            "chart_id": "brand_awareness",
            "chart_type": "horizontal_bar",
            "title": "Awareness",
        }
    )

    assert resolution.source == "chart_id_override"
    assert resolution.registry_key == "brand_awareness"
    assert resolution.builder_class is PPTXWaterfallBar


def test_chart_type_aliases_match_frontend_dispatch():
    resolver = PPTXChartResolver()

    scatter = resolver.resolve({"chart_type": "scatter_plot"})
    assert scatter.registry_key == "scatter_plot"
    assert scatter.builder_class is PPTXScatter

    table = resolver.resolve({"chart_type": "table"})
    assert table.registry_key == "table"
    assert table.builder_class is PPTXGenericTable

    horizontal = resolver.resolve({"chart_type": "bar_horizontal"})
    assert horizontal.registry_key == "horizontal_bar"


def test_legacy_chart_id_aliases_resolve_before_chart_type():
    resolver = PPTXChartResolver()

    sigma = resolver.resolve(
        {
            "chart_id": "market_position_sigma",
            "chart_type": "radar",
        }
    )
    assert sigma.registry_key == "market_position_radar"
    assert sigma.builder_class is PPTXRadar

    funnel = resolver.resolve(
        {
            "chart_id": "purchase_funnel",
            "chart_type": "snake_line",
        }
    )
    assert funnel.registry_key == "purchase_funnel"
    assert funnel.builder_class is PPTXSnakeLine


def test_unknown_chart_type_falls_back_to_generic_table():
    resolver = PPTXChartResolver()
    resolution = resolver.resolve({"chart_type": "not_a_real_chart"})

    assert resolution.source == "fallback_table"
    assert resolution.builder_class is PPTXGenericTable
    assert resolver.is_supported({"chart_type": "not_a_real_chart"}) is False
