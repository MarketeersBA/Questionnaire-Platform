"""Shared mixin and helpers for Taste Test dynamic slide concepts."""
from __future__ import annotations

import logging
from typing import List, Optional, Set, Tuple

import pandas as pd

logger = logging.getLogger("MyModules.dynamic_slides.taste_test")


def _comp_key(comp: Optional[List[str]]) -> str:
    return "_".join(comp) if comp else "default"


class _TasteTestMixin:
    """Shared logic for Taste Test concepts: process with _current_comparator, multi-item populate."""

    def _get_comp(self, project_inputs: dict):
        return project_inputs.get("_current_comparator")

    def _build_percentages(
        self,
        data_store,
        item: dict,
        project_inputs: dict,
        meta_data,
        meta_grids,
        visual_id: str,
        comp: Optional[List[str]],
        client: Optional[Any] = None,
        model: Optional[str] = None,
    ) -> Optional[pd.DataFrame]:
        from backend.analytics_module.src.Calculations.percentages import build_percentages

        it = dict(item)
        if comp:
            it["_filter_brands"] = comp
        focus = comp or project_inputs.get("focus_brands") or []
        my_brand = project_inputs.get("my_brand") or ""
        try:
            df = build_percentages(
                data_store, it, project_inputs, meta_data,
                focus, [my_brand] if my_brand else None, meta_grids, visual_id,
                client=client, model=model
            )
            return df.fillna(0) if df is not None and not df.empty else None
        except Exception as exc:
            logger.warning("build_percentages failed for %s: %s", visual_id, exc)
            return None

    def _build_comparison(
        self,
        item: dict,
        comp: List[str],
        project_inputs: dict,
        data_store,
        meta_data,
        codebook_df,
    ) -> Optional[pd.DataFrame]:
        from backend.analytics_module.src.Calculations.taste_test import build_comparison

        try:
            return build_comparison(
                item, comp, project_inputs, data_store, meta_data, codebook_df
            )
        except Exception as exc:
            logger.warning("build_comparison failed for %s: %s", item.get("inputs"), exc)
            return None

    def _populate_multi_item(
        self,
        pres,
        instance_key: str,
        payload: dict,
        items: List[Tuple[str, str, dict]],
        my_brand: str,
        modified_slides: Set[int],
        log: logging.Logger,
    ) -> None:
        from backend.analytics_module.src.MyPPTX.handlers import _handle_percentages_unified, _handle_comparison
        from backend.analytics_module.src.MyPPTX.slides import duplicate_slide, find_slide_by_title, find_slide_index_by_title_exact

        template_index = find_slide_index_by_title_exact(pres, self.template_slide_title)
        if template_index is None:
            for alt in getattr(self, "alternate_titles", []) or []:
                template_index = find_slide_index_by_title_exact(pres, alt)
                if template_index is not None:
                    break
        if template_index is None:
            template_index = find_slide_by_title(pres, self.template_slide_title)
        if template_index is None:
            log.warning("Template slide '%s' not found for %s", self.template_slide_title, type(self).__name__)
            return
        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)
        modified_slides.add(new_slide_idx)

        percentages = payload.get("percentages") or {}
        comparison = payload.get("comparison") or {}

        for visual_id, module, item_config in items:
            if module == "percentages" and visual_id in percentages:
                data_map = {"percentages": {visual_id: percentages[visual_id]}}
                _handle_percentages_unified(
                    pres, data_map, item_config, visual_id, log, modified_slides,
                    target_slide_index=new_slide_idx, target_slide=new_slide,
                )
            elif module == "comparison" and visual_id in comparison:
                data_map = {"comparison": {visual_id: comparison[visual_id]}}
                item_config = dict(item_config)
                item_config["module"] = "comparison"
                _handle_comparison(
                    pres, my_brand, data_map, item_config, visual_id, log, modified_slides,
                    target_slide_index=new_slide_idx, target_slide=new_slide,
                )
