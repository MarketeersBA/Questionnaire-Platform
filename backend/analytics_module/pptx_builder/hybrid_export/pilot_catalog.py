from __future__ import annotations

from enum import Enum
from typing import Any, Dict, FrozenSet, Optional

from ..chart_fidelity_matrix import PROTEIN_BAR_SURVEY_ID


class PilotChartFamily(str, Enum):
  HEATMAP = "heatmap"
  WORDCLOUD = "wordcloud"
  RADAR = "radar"
  SCATTER = "scatter"
  GAUGE = "gauge"
  DENSE_TABLE = "dense_table"


PILOT_SURVEY_ID = PROTEIN_BAR_SURVEY_ID
PILOT_REPORT_ID = "69ce229eeed39ea9d5282afa"

PILOT_CHART_FAMILIES: Dict[PilotChartFamily, FrozenSet[str]] = {
  PilotChartFamily.HEATMAP: frozenset(
    {
      "affinity_heatmap",
      "heatmap",
      "audience_affinity",
    }
  ),
  PilotChartFamily.WORDCLOUD: frozenset(
    {
      "wordcloud",
      "verbatim_cloud",
      "open_end_likes",
      "open_end_dislikes",
      "open_end_improvements",
    }
  ),
  PilotChartFamily.RADAR: frozenset(
    {
      "radar",
      "market_position_radar",
      "attribute_radar",
      "market_position_sigma",
    }
  ),
  PilotChartFamily.SCATTER: frozenset(
    {
      "scatter",
      "scatter_plot",
      "scatter_bubble",
      "sigma_intent_scatter",
      "sub_attribute_scatter",
      "overall_scatter",
      "competitive_position_matrix",
      "sigma_intent",
    }
  ),
  PilotChartFamily.GAUGE: frozenset(
    {
      "gauge",
      "nps_recommend",
    }
  ),
  PilotChartFamily.DENSE_TABLE: frozenset(
    {
      "criteria_table",
      "reference_table",
      "table",
      "purchase_funnel_reference_table",
    }
  ),
}

PILOT_CHART_TYPES: Dict[PilotChartFamily, FrozenSet[str]] = {
  PilotChartFamily.HEATMAP: frozenset({"heatmap", "affinity_heatmap"}),
  PilotChartFamily.WORDCLOUD: frozenset({"wordcloud"}),
  PilotChartFamily.RADAR: frozenset({"radar", "market_position_radar"}),
  PilotChartFamily.SCATTER: frozenset(
    {
      "scatter",
      "scatter_plot",
      "scatter_bubble",
      "sigma_intent_scatter",
    }
  ),
  PilotChartFamily.GAUGE: frozenset({"gauge"}),
  PilotChartFamily.DENSE_TABLE: frozenset(
    {
      "criteria_table",
      "reference_table",
      "table",
    }
  ),
}

PILOT_CHART_IDS: FrozenSet[str] = frozenset(
  chart_id
  for family_ids in PILOT_CHART_FAMILIES.values()
  for chart_id in family_ids
)


def pilot_family_for_chart(chart: Dict[str, Any]) -> Optional[PilotChartFamily]:
  chart_id = str(chart.get("chart_id") or "")
  chart_type = str(chart.get("chart_type") or "")

  if chart_id in PILOT_CHART_IDS:
    for family, ids in PILOT_CHART_FAMILIES.items():
      if chart_id in ids:
        return family

  for family, types in PILOT_CHART_TYPES.items():
    if chart_type in types:
      return family

  return None
