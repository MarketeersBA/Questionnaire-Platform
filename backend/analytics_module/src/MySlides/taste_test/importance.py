from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MySlides.taste_test.common import _TasteTestMixin, logger

IMPORTANCE_ITEMS = [
    ("Overall Scatter", "comparison", {
        "module": "comparison",
        "inputs": {"set_of_features": "overall_features", "ideal": 10, "purchase_intent": "comparison_purchase_intent"},
        "viz_type": "scatter", "new_name": "Feature Importance", "top_n": 5, "show_labels": True, "label_category": "Hero", "highlight_top_n": 1,
        "rect": {"x_padding_slots": 2.0, "y_padding_frac": 0.2},
    }),
    ("Sub Scatter", "comparison", {
        "module": "comparison",
        "inputs": {"set_of_features": "of_most_important", "ideal": 5, "purchase_intent": "comparison_purchase_intent"},
        "viz_type": "scatter", "new_name": "Sub-Features of {highest_feature}", "highest_feature_from": "Overall Scatter", "top_n": 5, "show_labels": True, "label_category": "Hero", "highlight_top_n": 1,
        "rect": {"x_padding_slots": 2.0, "y_padding_frac": 0.2},
    }),
]


@register_slide(section="Taste Test")
class TasteTestImportanceSlide(DynamicSlideConcept, _TasteTestMixin):
    INSTANCE_KEY = "slide_importance"
    TEMPLATE_TITLE = "Importance"
    alternate_titles = ["Feature Importance"]

    def __init__(self, **kwargs) -> None:
        super().__init__(slide_id=self.INSTANCE_KEY, section="Taste Test", template_slide_title=self.TEMPLATE_TITLE, **kwargs)
        self.my_brand = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["comparators", "overall_features", "feature_map", "comparison_purchase_intent"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Any = None, model: str = None) -> Dict[str, Any]:
        comp = self._get_comp(project_inputs)
        if not comp:
            return {}

        payload = {"percentages": {}, "comparison": {}}
        for vid, _, item_cfg in IMPORTANCE_ITEMS:
            df = self._build_comparison(item_cfg, comp, project_inputs, data_store, meta_data, codebook_df)
            if df is not None:
                payload["comparison"][vid] = df
        if not payload["comparison"]:
            return {}
        return {self.INSTANCE_KEY: payload}

    def populate(self, pres, instance_key: str, payload: Any, modified_slides: Optional[Set[int]] = None, log: Optional[logging.Logger] = None) -> None:
        log = log or logger
        tracker = modified_slides if modified_slides is not None else set()
        self._populate_multi_item(pres, instance_key, payload, IMPORTANCE_ITEMS, self.my_brand, tracker, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Importance"[:500]
