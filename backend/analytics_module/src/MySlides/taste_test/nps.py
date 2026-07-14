from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MySlides.taste_test.common import _TasteTestMixin, logger

NPS_ITEMS = [
    ("Recommend to others", "percentages", {
        "data": "pivot_scalers",
        "metrics": {
            "Promoters": {"function": "perc_of_values", "args": ["Recommend", [9, 10]]},
            "Neutrals": {"function": "perc_of_values", "args": ["Recommend", [7, 8]]},
            "Rejecters": {"function": "perc_of_values", "args": ["Recommend", [1, 2, 3, 4, 5, 6]]},
        },
        "group_by": ["brand"], "viz_type": "chart", "orientation": "column",
        "order_columns": ["Promoters", "Neutrals", "Rejecters"], "ymax": 1, "ymin": 0,
    }),
]


@register_slide(section="Taste Test")
class TasteTestNpsSlide(DynamicSlideConcept, _TasteTestMixin):
    INSTANCE_KEY = "slide_nps"
    TEMPLATE_TITLE = "NPS"

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
        return ["comparators", "Recommend"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Any = None, model: str = None) -> Dict[str, Any]:
        comp = self._get_comp(project_inputs)
        payload = {"percentages": {}, "comparison": {}}
        item_cfg = NPS_ITEMS[0][2]
        df = self._build_percentages(
            data_store, item_cfg, project_inputs, meta_data, meta_grids, "Recommend to others", comp,
            client=client, model=model
        )
        if df is not None:
            payload["percentages"]["Recommend to others"] = df
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
        self._populate_multi_item(pres, instance_key, payload, NPS_ITEMS, self.my_brand, tracker, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test NPS"[:500]
