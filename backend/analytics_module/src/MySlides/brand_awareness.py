"""BrandAwarenessSlide — single slide with one brand-awareness chart (TOM, Unaided, Aided, Total)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)

# Fixed item config for build_percentages (matches slides_content.json slide_brand_awareness)
BRAND_AWARENESS_ITEM = {
    "data": "decoded_raw_data",
    "metrics": {
        "TOM": {"function": "perc_of_all_values", "args": ["tom"]},
        "Other-Unaided": {"function": "perc_of_all_values", "args": ["unaided"]},
        "Aided": {"function": "perc_of_all_values", "args": ["aided"]},
        "Total Awareness": {
            "function": "perc_of_all_values_total",
            "args": [["tom", "unaided", "aided"]],
        },
    },
    "Order_By": "Total Awareness",
    "Limit": 10,
    "orientation": "column",
    "ymax": 1,
    "ymin": 0,
    "theme": "4th_white",
}

VISUAL_ID = "brand awareness"
INSTANCE_KEY = "slide_brand_awareness"


@register_slide(section="Brand Awareness and Purchase Funnel")
class BrandAwarenessSlide(DynamicSlideConcept):
    """
    Single-instance dynamic slide: one Brand Awareness chart (no loop).

    Required project_inputs keys
    ----------------------------
    focus_brands : list[str]  (optional) brands to filter; same scope as BA-PF.
    """

    def __init__(
        self,
        slide_id: str = INSTANCE_KEY,
        section: str = "Brand Awareness and Purchase Funnel",
        template_slide_title: str = "Brand Awareness",
        sc_theme: Optional[str] = "4th_white",
        mc_theme: Optional[str] = None,
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)
        self.focus_brands: List[str] = []
        self.my_brand: str = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["focus_brands"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.focus_brands = list(project_inputs.get("focus_brands") or [])
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def _item_for_process(self) -> dict:
        """Build item dict for build_percentages; optionally apply focus_brands filter."""
        item = dict(BRAND_AWARENESS_ITEM)
        if self.focus_brands:
            item["_filter_brands"] = self.focus_brands
        return item

    def process(
        self,
        data_store,
        meta_data,
        meta_grids,
        codebook_df,
        project_inputs: dict,
        client: Optional[Any] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        from backend.analytics_module.src.Calculations.percentages import build_percentages

        item = self._item_for_process()
        try:
            df = build_percentages(
                data_store,
                item,
                project_inputs,
                meta_data,
                self.focus_brands,
                [self.my_brand] if self.my_brand else None,
                meta_grids,
                VISUAL_ID,
                client=client,
                model=model,
            )
        except Exception as exc:
            logger.warning(
                "BrandAwarenessSlide: build_percentages failed: %s. Skipping.",
                exc,
            )
            return {}

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.info("BrandAwarenessSlide: no data produced, skipping.")
            return {}

        return {INSTANCE_KEY: df.fillna(0)}

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        from backend.analytics_module.src.MyPPTX.handlers import _handle_percentages_unified
        from backend.analytics_module.src.MyPPTX.slides import duplicate_slide, find_slide_by_title

        log = log or logger
        tracker: Set[int] = modified_slides if modified_slides is not None else set()

        template_index = find_slide_by_title(pres, self.template_slide_title)
        if template_index is None:
            log.warning(
                "BrandAwarenessSlide: template slide '%s' not found, skipping.",
                self.template_slide_title,
            )
            return

        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)

        data_map = {"percentages": {VISUAL_ID: payload}}
        item = self._item_for_process()
        _handle_percentages_unified(
            pres,
            data_map,
            item,
            VISUAL_ID,
            log,
            tracker,
            target_slide_index=new_slide_idx,
            target_slide=new_slide,
            chart_theme=self.sc_theme,
        )

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        """Write Brand Awareness.xlsx — one sheet with the chart data."""
        if not payloads or INSTANCE_KEY not in payloads:
            return None

        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Brand Awareness.xlsx"

        try:
            df = payloads[INSTANCE_KEY]
            if not isinstance(df, pd.DataFrame) or df.empty:
                return None
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                df.to_excel(writer, sheet_name="Brand Awareness"[:31], index=True)
            logger.info("Brand Awareness Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Brand Awareness Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, pd.DataFrame):
            return str(payload)[:500]
        if payload.empty:
            return "Brand Awareness: no data."
        return (
            "Brand Awareness (TOM, Unaided, Aided, Total)\n\n"
            + payload.head(10).to_string(max_colwidth=20)
        )[:3000]
