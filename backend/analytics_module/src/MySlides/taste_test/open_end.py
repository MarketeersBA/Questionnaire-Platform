"""
Open-ended Taste Test slides (Likes / Dislikes / Improvements): ai_percentages on decoded data.
Each slide has two tables (one per brand in the comparator pair), named e.g. "Likes1" / "Likes2".
Fixed template slides in the deck; run per comparator pair (outer loop in run.py).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MySlides.taste_test.common import _TasteTestMixin, logger


def _brand_to_suffix_digit(project_inputs: dict, brand: str) -> Optional[str]:
    """Map comparator brand label to dataset suffix digit (1, 2, …) via suffix_map / comparators_map."""
    b = str(brand).strip()
    sm = project_inputs.get("suffix_map") or {}
    for k, v in sm.items():
        if str(v).strip() == b:
            return str(k)
    cm = project_inputs.get("comparators_map") or {}
    if isinstance(cm, dict):
        for k, v in cm.items():
            if str(v).strip() == b:
                return str(k)
    return None


def _resolved_open_end_column(project_inputs: dict, column_key: str, brand: str) -> Optional[str]:
    """
    Build the wide-format column name (e.g. FavoriteInTaste1).

    decoded_raw_data from the decoder has no ``brand`` row; open-end questions are stored as
    ``<base><suffix>`` (e.g. FavoriteInTaste1 / FavoriteInTaste2). Filtering on ``brand`` always
    yielded an empty frame — we must target the suffixed column per comparator brand.
    """
    base = project_inputs.get(column_key)
    if not base or not isinstance(base, str):
        return None
    suf = _brand_to_suffix_digit(project_inputs, brand)
    if suf is None:
        comp = project_inputs.get("_current_comparator") or []
        if brand in comp:
            suf = str(comp.index(brand) + 1)
        else:
            return None
    return f"{base}{suf}"


def _open_end_item_cfg_for_column(column_name: str, purpose: str) -> dict:
    return {
        "data": "decoded_raw_data",
        "viz_type": "table",
        "metrics": {
            "result": {"function": "ai_percentages", "args": [column_name, purpose]},
        },
    }


class _OpenEndSlideMixin(_TasteTestMixin):
    """
    Shared process/populate for open-end slides whose templates contain
    two tables named ``{base_name}1`` and ``{base_name}2`` (one per brand).
    """

    TABLE_BASE_NAME: str = ""
    COLUMN_KEY: str = ""
    PURPOSE: str = ""

    def _process_per_brand(
        self,
        data_store,
        meta_data,
        meta_grids,
        project_inputs: dict,
        client: Optional[Any] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        comp = self._get_comp(project_inputs)
        if not comp:
            return {}

        raw = data_store.get("decoded_raw_data")
        if raw is None or getattr(raw, "empty", True):
            logger.warning("%s: decoded_raw_data missing or empty", type(self).__name__)
            return {}

        payload: Dict[str, pd.DataFrame] = {}

        for idx, brand in enumerate(comp, start=1):
            col_name = _resolved_open_end_column(project_inputs, self.COLUMN_KEY, brand)
            table_id = f"{self.TABLE_BASE_NAME}{idx}"
            if not col_name:
                logger.warning(
                    "%s: could not resolve column for %s=%r brand=%r",
                    type(self).__name__, self.COLUMN_KEY, project_inputs.get(self.COLUMN_KEY), brand,
                )
                continue
            if col_name not in raw.columns:
                logger.warning(
                    "%s: column %r not in decoded_raw_data (brand=%r)",
                    type(self).__name__, col_name, brand,
                )
                continue

            brand_cfg = _open_end_item_cfg_for_column(col_name, self.PURPOSE)
            df = self._build_percentages(
                data_store, brand_cfg, project_inputs,
                meta_data, meta_grids, table_id, None,
                client=client, model=model
            )
            if df is not None and not df.empty:
                payload[table_id] = df

        if not payload:
            return {}
        return {self.INSTANCE_KEY: {"percentages": payload}}

    def _populate_per_brand(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        log = log or logger
        tracker = modified_slides if modified_slides is not None else set()

        from backend.analytics_module.src.MyPPTX.slides import (
            duplicate_slide,
            find_slide_by_title,
            find_slide_index_by_title_exact,
        )
        from backend.analytics_module.src.MyPPTX import tables

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
        tracker.add(new_slide_idx)

        percentages = payload.get("percentages") or {}

        for table_id, df in percentages.items():
            table = tables.get_table_by_name(pres, table_id, slide=new_slide)
            if table is None:
                log.warning("Table '%s' not found on slide '%s'", table_id, self.template_slide_title)
                continue
            data = df.copy()
            pct_col = "Percentage" if "Percentage" in data.columns else (
                "percentage" if "percentage" in data.columns else None)
            if pct_col:
                data[pct_col] = data[pct_col] / 100
            tables.template_table(
                table, data.head(10), pres,
                column_override={0: "category"},
                percent_cols="all",
                apply_theme=False,
                slide_index_hint=new_slide_idx,
            )


@register_slide(section="Taste Test")
class TasteTestLikesSlide(DynamicSlideConcept, _OpenEndSlideMixin):
    INSTANCE_KEY = "slide_likes"
    TEMPLATE_TITLE = "Likes"
    TABLE_BASE_NAME = "Likes"
    COLUMN_KEY = "like_in_taste"
    PURPOSE = "like"

    def __init__(self, **kwargs) -> None:
        super().__init__(slide_id=self.INSTANCE_KEY, section="Taste Test", template_slide_title=self.TEMPLATE_TITLE, **kwargs)
        self.my_brand = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["comparators", "like_in_taste"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Optional[Any] = None, model: Optional[str] = None) -> Dict[str, Any]:
        return self._process_per_brand(data_store, meta_data, meta_grids, project_inputs, client=client, model=model)

    def populate(self, pres, instance_key: str, payload: Any, modified_slides: Optional[Set[int]] = None, log: Optional[logging.Logger] = None) -> None:
        self._populate_per_brand(pres, instance_key, payload, modified_slides, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Likes"[:500]


@register_slide(section="Taste Test")
class TasteTestDislikesSlide(DynamicSlideConcept, _OpenEndSlideMixin):
    INSTANCE_KEY = "slide_dislikes"
    TEMPLATE_TITLE = "Dislikes"
    TABLE_BASE_NAME = "Dislikes"
    COLUMN_KEY = "dislike_in_taste"
    PURPOSE = "dislike"

    def __init__(self, **kwargs) -> None:
        super().__init__(slide_id=self.INSTANCE_KEY, section="Taste Test", template_slide_title=self.TEMPLATE_TITLE, **kwargs)
        self.my_brand = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["comparators", "dislike_in_taste"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Optional[Any] = None, model: Optional[str] = None) -> Dict[str, Any]:
        return self._process_per_brand(data_store, meta_data, meta_grids, project_inputs, client=client, model=model)

    def populate(self, pres, instance_key: str, payload: Any, modified_slides: Optional[Set[int]] = None, log: Optional[logging.Logger] = None) -> None:
        self._populate_per_brand(pres, instance_key, payload, modified_slides, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Dislikes"[:500]


@register_slide(section="Taste Test")
class TasteTestImprovementsSlide(DynamicSlideConcept, _OpenEndSlideMixin):
    INSTANCE_KEY = "slide_improvements"
    TEMPLATE_TITLE = "Improvements"
    TABLE_BASE_NAME = "Improvements"
    COLUMN_KEY = "improvement_in_taste"
    PURPOSE = "improve"

    def __init__(self, **kwargs) -> None:
        super().__init__(slide_id=self.INSTANCE_KEY, section="Taste Test", template_slide_title=self.TEMPLATE_TITLE, **kwargs)
        self.my_brand = ""

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["comparators", "improvement_in_taste"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand") or ""
        self._inputs_loaded = True

    def process(self, data_store, meta_data, meta_grids, codebook_df, project_inputs: dict, client: Optional[Any] = None, model: Optional[str] = None) -> Dict[str, Any]:
        return self._process_per_brand(data_store, meta_data, meta_grids, project_inputs, client=client, model=model)

    def populate(self, pres, instance_key: str, payload: Any, modified_slides: Optional[Set[int]] = None, log: Optional[logging.Logger] = None) -> None:
        self._populate_per_brand(pres, instance_key, payload, modified_slides, log)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        return "Taste Test Improvements"[:500]
