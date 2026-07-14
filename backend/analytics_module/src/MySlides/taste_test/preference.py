from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MySlides.taste_test.common import _TasteTestMixin, logger

PREFERENCE_ITEMS = [
    ("Product Preference", "percentages", {
        "data": "decoded_raw_data",
        "metrics": {"Product Preference": {"function": "perc_of_all_values", "args": ["product_preference"]}},
        "Order_By": "Product Preference",
    }),
    ("overall Averages", "comparison", {
        "module": "comparison",
        "inputs": {"set_of_features": "overall_features", "ideal": 10, "purchase_intent": "comparison_purchase_intent"},
        "viz_type": "chart", "new_name": "Overall Score", "xmax": 10, "ymin": 1, "show_label": False, "label_column": "index", "theme": "navy_legend",
    }),
    ("Criteria-Overall", "comparison", {
        "module": "comparison",
        "inputs": {"set_of_features": "overall_features", "ideal": 10, "purchase_intent": "comparison_purchase_intent"},
        "viz_type": "table", "new_name": " ",
    }),
]


@register_slide(section="Taste Test")
class TasteTestPreferenceSlide(DynamicSlideConcept, _TasteTestMixin):
    INSTANCE_KEY = "slide_preference"
    TEMPLATE_TITLE = "Product Preference"

    def __init__(self, **kwargs) -> None:
        super().__init__(
            slide_id=self.INSTANCE_KEY,
            section="Taste Test",
            template_slide_title=self.TEMPLATE_TITLE,
            **kwargs,
        )
        self.my_brand = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["comparators", "product_preference", "overall_features", "comparison_purchase_intent"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Any = None, model: str = None) -> Dict[str, Any]:
        comp = self._get_comp(project_inputs)
        if comp is None and not project_inputs.get("comparators"):
            return {}

        payload = {"percentages": {}, "comparison": {}}

        item = dict(PREFERENCE_ITEMS[0][2])
        df = self._build_percentages(
            data_store, item, project_inputs, meta_data, meta_grids, "Product Preference", comp,
            client=client, model=model
        )
        if df is not None:
            payload["percentages"]["Product Preference"] = df

        for vid, mod, item_cfg in PREFERENCE_ITEMS[1:]:
            if mod == "comparison" and comp:
                df = self._build_comparison(item_cfg, comp, project_inputs, data_store, meta_data, codebook_df)
                if df is not None:
                    payload["comparison"][vid] = df

        if not payload["percentages"] and not payload["comparison"]:
            return {}
        return {self.INSTANCE_KEY: payload}

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        log = log or logger
        tracker = modified_slides if modified_slides is not None else set()

        from backend.analytics_module.src.MyPPTX.handlers import _handle_percentages_unified
        from backend.analytics_module.src.MyPPTX import charts, design_config, tables
        from backend.analytics_module.src.MyPPTX.slides import (
            duplicate_slide,
            find_slide_by_title,
            find_slide_index_by_title_exact,
        )

        if not isinstance(payload, dict):
            log.warning("Unexpected payload type for %s: %s", self.INSTANCE_KEY, type(payload))
            return

        template_index = find_slide_index_by_title_exact(pres, self.template_slide_title)
        if template_index is None:
            template_index = find_slide_by_title(pres, self.template_slide_title)
        if template_index is None:
            log.warning(
                "Template slide '%s' not found for %s",
                self.template_slide_title,
                type(self).__name__,
            )
            return

        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)
        tracker.add(new_slide_idx)

        percentages = payload.get("percentages") or {}
        comparison = payload.get("comparison") or {}

        pref_df = percentages.get("Product Preference")
        if pref_df is not None:
            item_config = dict(PREFERENCE_ITEMS[0][2])
            data_map = {"percentages": {"Product Preference": pref_df}}
            _handle_percentages_unified(
                pres,
                data_map,
                item_config,
                "Product Preference",
                log,
                tracker,
                target_slide_index=new_slide_idx,
                target_slide=new_slide,
            )

        avg_table = comparison.get("overall Averages")
        if avg_table is not None and not avg_table.empty:
            avg_score_cols = [c for c in avg_table.columns if str(c).endswith("avg score")]
            comparators = [str(c).replace("avg score", "").strip() for c in avg_score_cols]
            if avg_score_cols and comparators:
                num_rows = min(9, len(avg_table.index))
                distances = pd.DataFrame(
                    {c: [1 + i * 1.5 for i in range(num_rows)] for c in comparators}
                )
                chart_df = pd.concat(
                    [
                        avg_table[avg_score_cols].reset_index(),
                        distances.iloc[::-1].reset_index(drop=True),
                    ],
                    axis=1,
                ).iloc[:num_rows]

                item = dict(PREFERENCE_ITEMS[1][2])
                new_name = item.get("new_name", "overall Averages")
                label_column = item.get("label_column", "index")
                show_label = bool(item.get("show_label", False))
                xmax = item.get("inputs", {}).get("ideal") or item.get("xmax") or 10
                ymax = item.get("ymax")
                if ymax is None:
                    try:
                        ymax = float(chart_df[comparators[0]].iloc[0]) + 0.5
                    except Exception:
                        ymax = 10
                ymin = 0.5

                result = charts.ChartFinder.get_chart_with_location(
                    pres, "overall Averages", target_slide_index=new_slide_idx
                )
                if result:
                    chart_slide_idx, chart_shape, chart = result
                    theme = item.get("theme")
                    if theme:
                        design_config.set_chart_theme(theme)
                    charts.populate_xy_chart(
                        chart_df,
                        chart,
                        avg_score_cols,
                        comparators,
                        f"{new_name}",
                        label_column=label_column,
                        ymax=ymax,
                        xmax=xmax,
                        ymin=ymin,
                        show_label=show_label,
                        chart_shape=chart_shape,
                    )
                    if chart_slide_idx is not None:
                        tracker.add(chart_slide_idx)
                else:
                    log.info("No chart found for %s on slide %s", "overall Averages", new_slide_idx)

        criteria_table = comparison.get("Criteria-Overall")
        if criteria_table is not None and not criteria_table.empty:
            table = tables.get_table_by_name(pres, "Criteria-Overall", slide=new_slide)
            if table is None:
                table = tables.get_table_by_name(pres, "Criteria", slide=new_slide)
            if table is None:
                log.info("No table found for %s (tried %s and %s)", "Criteria-Overall", "Criteria-Overall", "Criteria")
            else:
                item = dict(PREFERENCE_ITEMS[2][2])
                tables.template_table(
                    table,
                    criteria_table.reset_index(),
                    pres,
                    column_override={0: "index"},
                    new_name=item.get("new_name"),
                    apply_theme=bool(item.get("theme")),
                    slide_index_hint=new_slide_idx,
                )

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Product Preference"[:500]
