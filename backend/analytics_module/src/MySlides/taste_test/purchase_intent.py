from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MySlides.taste_test.common import _TasteTestMixin, logger

PI_ITEMS = [
    ("Purchase Intent", "percentages", {
        "data": "pivot_scalers_decoded",
        "metrics": {"PI": {"function": "perc_of_all_values", "args": ["comparison_purchase_intent"]}},
        "group_by": ["brand"], "viz_type": "chart", "orientation": "column",
        "order_columns": [
            "Definitely would buy", "Probably would buy", "Neutral",
            "Probably would NOT buy", "Definitely would NOT buy",
        ],
        "ymax": 1, "ymin": 0,
    }),
    ("Purchase Intent for Real Price", "percentages", {
        "data": "pivot_scalers",
        "metrics": {"PIRP": {"function": "perc_of_values", "args": ["real_price_pi", [9, 10]]}},
        "group_by": ["brand"], "viz_type": "chart",
    }),
]


@register_slide(section="Taste Test")
class TasteTestPurchaseIntentSlide(DynamicSlideConcept, _TasteTestMixin):
    INSTANCE_KEY = "slide_purchase_intent"
    TEMPLATE_TITLE = "Purchase Intent"

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
        return ["comparators", "comparison_purchase_intent", "real_price_pi"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Any = None, model: str = None) -> Dict[str, Any]:
        comp = self._get_comp(project_inputs)
        payload = {"percentages": {}, "comparison": {}}
        for vid, _, item_cfg in PI_ITEMS:
            df = self._build_percentages(
                data_store, item_cfg, project_inputs, meta_data, meta_grids, vid, comp,
                client=client, model=model
            )
            if df is not None:
                payload["percentages"][vid] = df
        if not payload["percentages"]:
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
        self._populate_multi_item(pres, instance_key, payload, PI_ITEMS, self.my_brand, tracker, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Purchase Intent"[:500]
