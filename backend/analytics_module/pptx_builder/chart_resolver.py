from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Type

from .pptx_affinity_heatmap import PPTXAffinityHeatmap
from .pptx_brand_comparison import PPTXBrandComparison
from .pptx_criteria_table import PPTXCriteriaTable
from .pptx_funnel import PPTXFunnel
from .pptx_funnel_cards import PPTXFunnelCards
from .pptx_generic_table import PPTXGenericTable
from .pptx_grouped_bar import PPTXGroupedBar
from .pptx_horizontal_bar import PPTXHorizontalBar
from .pptx_importance_combined import PPTXImportanceCombined
from .pptx_importance_matrix import PPTXImportanceMatrix
from .pptx_image_chart import PPTXImageChart
from .pptx_likeness_profile import PPTXLikenessProfile
from .pptx_nps_gauge import PPTXNPSGauge
from .pptx_positioning_matrix import PPTXPositioningMatrix
from .pptx_profile_chart import PPTXProfileChart
from .pptx_radar import PPTXRadar
from .pptx_reference_table import PPTXReferenceTable
from .pptx_scorecard import PPTXScorecard
from .pptx_scatter import PPTXScatter
from .pptx_sigma_intent import PPTXSigmaIntent
from .pptx_snake_line import PPTXSnakeLine
from .pptx_stacked_bar import PPTXStackedBar
from .pptx_verbatim import PPTXVerbatim
from .pptx_waterfall_bar import PPTXWaterfallBar
from .pptx_wordcloud import PPTXWordcloud

DEFAULT_CHART_TYPE = "table"


@dataclass(frozen=True)
class ChartResolution:
    """Result of resolving a report chart payload to a native PPTX builder."""

    builder_class: Type
    registry_key: str
    source: str
    chart_type: str
    chart_id: Optional[str]

    @property
    def uses_fallback_table(self) -> bool:
        return self.source == "fallback_table"


def build_builder_registry() -> Dict[str, Type]:
    """Canonical builder registry keyed by resolver lookup keys."""
    return {
        "criteria_table": PPTXCriteriaTable,
        "profile_chart": PPTXProfileChart,
        "likeness_profile": PPTXLikenessProfile,
        "grouped_bar": PPTXGroupedBar,
        "horizontal_bar": PPTXHorizontalBar,
        "bar_horizontal": PPTXHorizontalBar,
        "stacked_bar": PPTXStackedBar,
        "preference_bar": PPTXHorizontalBar,
        "radar": PPTXRadar,
        "heatmap": PPTXImportanceMatrix,
        "gauge": PPTXNPSGauge,
        "nps_gauge": PPTXNPSGauge,
        "nps_recommend": PPTXNPSGauge,
        "wordcloud": PPTXWordcloud,
        "verbatim_cloud": PPTXWordcloud,
        "verbatim_analysis": PPTXVerbatim,
        "verbatim_summary": PPTXVerbatim,
        "qualitative_analysis": PPTXVerbatim,
        "funnel": PPTXFunnel,
        "scatter": PPTXScatter,
        "scatter_plot": PPTXScatter,
        "sigma_intent_scatter": PPTXSigmaIntent,
        "sigma_intent": PPTXSigmaIntent,
        "scatter_bubble": PPTXPositioningMatrix,
        "positioning_matrix": PPTXPositioningMatrix,
        "bubble_chart": PPTXPositioningMatrix,
        "affinity_heatmap": PPTXAffinityHeatmap,
        "brand_comparison": PPTXBrandComparison,
        "scorecard": PPTXScorecard,
        "brand_summary": PPTXScorecard,
        "funnel_ratio_cards": PPTXFunnelCards,
        "funnel_cards": PPTXFunnelCards,
        "purchase_funnel_ratio_cards": PPTXFunnelCards,
        "snake_line": PPTXSnakeLine,
        "purchase_funnel": PPTXSnakeLine,
        "purchase_funnel_headline_line": PPTXSnakeLine,
        "line": PPTXLikenessProfile,
        "reference_table": PPTXReferenceTable,
        "funnel_reference_table": PPTXReferenceTable,
        "purchase_funnel_reference_table": PPTXReferenceTable,
        "table": PPTXGenericTable,
        "brand_awareness": PPTXWaterfallBar,
        "awareness_waterfall": PPTXWaterfallBar,
        "awareness_trial_usage": PPTXWaterfallBar,
        "brand_performance_matrix": PPTXImportanceMatrix,
        "brand_attribute_matrix": PPTXImportanceMatrix,
        "brand_performance_polar": PPTXRadar,
        "market_position_radar": PPTXRadar,
        "brand_attributes_gap_bar": PPTXHorizontalBar,
        "attribute_deep_dive": PPTXHorizontalBar,
        "open_end_likes": PPTXWordcloud,
        "open_end_dislikes": PPTXWordcloud,
        "open_end_improvements": PPTXWordcloud,
        "importance_combined": PPTXImportanceCombined,
        "positioning_table": PPTXGenericTable, # Map to generic table for now, with highlight logic in handlers
        "image_capture": PPTXImageChart,
    }


class PPTXChartResolver:
    """
    Mirrors frontend ChartRenderer dispatch:
    chart_id overrides first, then chart_type aliases, then legacy chart_id keys,
    then DataTable-style generic table fallback.
    """

    CHART_TYPE_ALIASES: Dict[str, str] = {
        "criteria_table": "criteria_table",
        "grouped_bar": "grouped_bar",
        "stacked_bar": "stacked_bar",
        "preference_bar": "preference_bar",
        "radar": "radar",
        "heatmap": "heatmap",
        "gauge": "gauge",
        "wordcloud": "wordcloud",
        "horizontal_bar": "horizontal_bar",
        "bar_horizontal": "horizontal_bar",
        "funnel": "funnel",
        "bar": "grouped_bar",
        "scatter": "scatter",
        "scatter_plot": "scatter_plot",
        "profile_chart": "profile_chart",
        "likeness_profile": "likeness_profile",
        "funnel_ratio_cards": "funnel_ratio_cards",
        "snake_line": "snake_line",
        "reference_table": "reference_table",
        "table": "table",
        "scorecard": "scorecard",
        "line": "line",
        "verbatim_analysis": "verbatim_analysis",
        "sigma_intent_scatter": "sigma_intent_scatter",
        "brand_comparison": "brand_comparison",
        "scatter_bubble": "scatter_bubble",
        "affinity_heatmap": "affinity_heatmap",
        "market_position_radar": "market_position_radar",
        "awareness_waterfall": "awareness_waterfall",
        "purchase_funnel": "purchase_funnel",
        "positioning_table": "positioning_table",
        "bar_horizontal": "horizontal_bar",
    }

    CHART_ID_OVERRIDES: Dict[str, str] = {
        "brand_awareness": "brand_awareness",
    }

    LEGACY_CHART_ID_ALIASES: Dict[str, str] = {
        "criteria_table": "criteria_table",
        "brand_profile_snake": "profile_chart",
        "likeness_profile_chart": "likeness_profile",
        "product_preference": "grouped_bar",
        "overall_averages": "grouped_bar",
        "purchase_funnel": "purchase_funnel",
        "purchase_funnel_ratio_cards": "purchase_funnel_ratio_cards",
        "purchase_funnel_reference_table": "reference_table",
        "attribute_radar": "radar",
        "purchase_intent": "stacked_bar",
        "brand_comparison_pi_ol": "brand_comparison",
        "nps_recommend": "nps_recommend",
        "price_sensitivity": "horizontal_bar",
        "importance_combined": "importance_combined",
        "sigma_intent": "sigma_intent",
        "market_position_sigma": "market_position_radar",
        "audience_affinity": "affinity_heatmap",
        "competitive_position_matrix": "scatter_bubble",
        "overall_switch": "grouped_bar",
        "switch_per_brand": "grouped_bar",
        "demographic_sub_averages": "grouped_bar",
    }

    def __init__(self, registry: Optional[Dict[str, Type]] = None):
        self._registry = registry or build_builder_registry()

    @property
    def registry(self) -> Dict[str, Type]:
        return self._registry

    def register(self, key: str, builder_class: Type) -> None:
        self._registry[key] = builder_class

    def resolve(self, chart_data: Dict[str, Any]) -> ChartResolution:
        chart_id = chart_data.get("chart_id")
        chart_type = chart_data.get("chart_type") or DEFAULT_CHART_TYPE

        if chart_id:
            override_key = self.CHART_ID_OVERRIDES.get(chart_id)
            if override_key:
                return self._resolution(
                    override_key,
                    source="chart_id_override",
                    chart_type=chart_type,
                    chart_id=chart_id,
                )

            if chart_id.startswith("open_end_"):
                return self._resolution(
                    "wordcloud",
                    source="chart_id",
                    chart_type=chart_type,
                    chart_id=chart_id,
                )

            if chart_id.startswith("brand_card_"):
                return self._resolution(
                    "scorecard",
                    source="chart_id",
                    chart_type=chart_type,
                    chart_id=chart_id,
                )

            legacy_key = self.LEGACY_CHART_ID_ALIASES.get(chart_id)
            if legacy_key:
                return self._resolution(
                    legacy_key,
                    source="chart_id",
                    chart_type=chart_type,
                    chart_id=chart_id,
                )

            if chart_id in self._registry:
                return self._resolution(
                    chart_id,
                    source="chart_id",
                    chart_type=chart_type,
                    chart_id=chart_id,
                )

        alias_key = self.CHART_TYPE_ALIASES.get(chart_type, chart_type)
        if alias_key in self._registry:
            return self._resolution(
                alias_key,
                source="chart_type",
                chart_type=chart_type,
                chart_id=chart_id,
            )

        return ChartResolution(
            builder_class=self._registry["table"],
            registry_key="table",
            source="fallback_table",
            chart_type=chart_type,
            chart_id=chart_id,
        )

    def _resolution(
        self,
        registry_key: str,
        *,
        source: str,
        chart_type: str,
        chart_id: Optional[str],
    ) -> ChartResolution:
        return ChartResolution(
            builder_class=self._registry[registry_key],
            registry_key=registry_key,
            source=source,
            chart_type=chart_type,
            chart_id=chart_id,
        )

    def is_supported(self, chart_data: Dict[str, Any]) -> bool:
        """True when the chart resolves to a specialized builder, not generic table fallback."""
        return not self.resolve(chart_data).uses_fallback_table

    def count_unsupported(self, charts: Any) -> int:
        if not isinstance(charts, list):
            return 0
        return sum(1 for chart in charts if isinstance(chart, dict) and not self.is_supported(chart))

    def describe_export_contract(self, chart_data: Dict[str, Any]) -> Dict[str, Any]:
        """Summarize resolver output for export manifest and contract diagnostics."""
        resolution = self.resolve(chart_data)
        return {
            "chart_id": chart_data.get("chart_id"),
            "chart_type": chart_data.get("chart_type"),
            "registry_key": resolution.registry_key,
            "source": resolution.source,
            "uses_fallback_table": resolution.uses_fallback_table,
        }
