"""Purchase funnel dynamic slides: chart and table (one slide each, no loop)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.Calculations.percentages import build_percentages
from backend.analytics_module.src.MyPPTX.handlers import _handle_percentages_unified
from backend.analytics_module.src.MyPPTX.slides import find_slide_by_title, duplicate_slide
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MyPPTX import tables

logger = logging.getLogger(__name__)

# Fixed item config for chart (matches slides_content.json slide_purchase_funnel_chart)
PURCHASE_FUNNEL_CHART_ITEM = {
    "data": "decoded_raw_data",
    "metrics": {
        "Total Awareness": {
            "function": "perc_of_all_values_total",
            "args": [["tom", "unaided", "aided"]],
        },
        "Consideration": {"function": "perc_of_all_values", "args": ["consideration"]},
        "Bought 12M": {"function": "perc_of_all_values", "args": ["bought_12m"]},
        "Bought 3M": {"function": "perc_of_all_values", "args": ["bought_3m"]},
        "MOU": {"function": "perc_of_all_values", "args": ["mou"]},
    },
    "Order_By": "Total Awareness",
    "Limit": 10,
    "orientation": "row",
    "ymax": 1,
    "ymin": 0,
}

# Fixed item config for table (matches slides_content.json slide_purchase_funnel_table)
PURCHASE_FUNNEL_TABLE_ITEM = {
    "data": "decoded_raw_data",
    "metrics": {
        "Total Awareness": {
            "function": "perc_of_all_values_total",
            "args": [["tom", "unaided", "aided"]],
        },
        "Bought 12M": {"function": "perc_of_all_values", "args": ["bought_12m"]},
        "Bought 3M": {"function": "perc_of_all_values", "args": ["bought_3m"]},
        "MOU": {"function": "perc_of_all_values", "args": ["mou"]},
    },
    "Order_By": "Total Awareness",
    "new_name": "Purchase Funnel",
}


@register_slide(section="Brand Awareness and Purchase Funnel")
class PurchaseFunnelChartSlide(DynamicSlideConcept):
    """
    Single-instance dynamic slide: one Purchase Funnel chart (no loop).

    Required project_inputs keys
    ----------------------------
    focus_brands : list[str]  (optional) brands to filter; same scope as BA-PF.
    """

    INSTANCE_KEY = "slide_purchase_funnel_chart"
    VISUAL_ID = "purchase funnel"

    def __init__(
        self,
        slide_id: str = INSTANCE_KEY,
        section: str = "Brand Awareness and Purchase Funnel",
        template_slide_title: str = "Purchase Funnel",
        sc_theme: Optional[str] = None,
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
        item = dict(PURCHASE_FUNNEL_CHART_ITEM)
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
                self.VISUAL_ID,
                client=client,
                model=model,
            )
        except Exception as exc:
            logger.warning(
                "PurchaseFunnelChartSlide: build_percentages failed: %s. Skipping.",
                exc,
            )
            return {}

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.info("PurchaseFunnelChartSlide: no data produced, skipping.")
            return {}

        return {self.INSTANCE_KEY: df.fillna(0)}

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:

        log = log or logger
        tracker: Set[int] = modified_slides if modified_slides is not None else set()

        template_index = find_slide_by_title(pres, self.template_slide_title)
        if template_index is None:
            log.warning(
                "PurchaseFunnelChartSlide: template slide '%s' not found, skipping.",
                self.template_slide_title,
            )
            return

        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)

        data_map = {"percentages": {self.VISUAL_ID: payload}}
        item = self._item_for_process()
        _handle_percentages_unified(
            pres,
            data_map,
            item,
            self.VISUAL_ID,
            log,
            tracker,
            target_slide_index=new_slide_idx,
            target_slide=new_slide,
        )

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        if not payloads or self.INSTANCE_KEY not in payloads:
            return None
        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Purchase Funnel Chart.xlsx"
        try:
            df = payloads[self.INSTANCE_KEY]
            if not isinstance(df, pd.DataFrame) or df.empty:
                return None
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                df.to_excel(writer, sheet_name="Purchase Funnel"[:31], index=True)
            logger.info("Purchase Funnel Chart Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Purchase Funnel Chart Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, pd.DataFrame):
            return str(payload)[:500]
        if payload.empty:
            return "Purchase Funnel chart: no data."
        return (
            "Purchase Funnel (Awareness, Consideration, Bought 12M, Bought 3M, MOU)\n\n"
            + payload.head(10).to_string(max_colwidth=20)
        )[:3000]


@register_slide(section="Brand Awareness and Purchase Funnel")
class PurchaseFunnelTableSlide(DynamicSlideConcept):
    """
    Single-instance dynamic slide: one Purchase Funnel table (pf_table, no loop).

    Required project_inputs keys
    ----------------------------
    focus_brands : list[str]  (optional) brands to filter; same scope as BA-PF.
    """

    INSTANCE_KEY = "slide_purchase_funnel_table"
    VISUAL_ID = "pf_table"

    _RATIO_COLS = ("Attractiveness Ratio", "Conversion Ratio", "Loyalty Ratio")

    @staticmethod
    def populate_pf_table(
        pres: Any,
        data: pd.DataFrame,
        item: dict,
        modified_slides: Set[int],
        target_slide_index: Optional[int] = None,
        target_slide: Optional[Any] = None,
        chart_theme: Optional[str] = None,
    ) -> None:
        """Fill pf_table and ratio-average tables on the target slide (template or duplicate)."""
        resolved_theme = (
            chart_theme
            or item.get("theme")
            or item.get("sc_theme")
            or item.get("mc_theme")
        )
        apply_theme = bool(resolved_theme)

        table = tables.get_table_by_name(pres, "pf_table", slide=target_slide)
        if table:
            highlight_rules: Dict[str, Any] = {}
            for ratio_col in PurchaseFunnelTableSlide._RATIO_COLS:
                if ratio_col in data.columns:
                    highlight_rules[ratio_col] = {
                        "op": "<",
                        "value": data[ratio_col].mean(),
                        "bg_color": (242, 220, 219),
                    }
            new_name = item.get("new_name")
            slide_idx = tables.template_table(
                table,
                data.head(10).reset_index(),
                pres,
                new_name=new_name,
                column_override={0: "index"},
                highlight_rules=highlight_rules,
                percent_cols="all",
                apply_theme=apply_theme,
                slide_index_hint=target_slide_index,
            )
            if slide_idx is not None:
                modified_slides.add(slide_idx)

        for col_name in PurchaseFunnelTableSlide._RATIO_COLS:
            if col_name in data.columns:
                avg = pd.DataFrame([[data[col_name].mean()]], columns=[f"{col_name} Average"])
                t = tables.get_table_by_name(pres, f"{col_name} Average", slide=target_slide)
                if t:
                    slide_idx = tables.template_table(
                        t,
                        avg,
                        pres,
                        column_override={0: f"{col_name} Average"},
                        percent_cols="all",
                        apply_theme=apply_theme,
                        slide_index_hint=target_slide_index,
                    )
                    if slide_idx is not None:
                        modified_slides.add(slide_idx)

    def __init__(
        self,
        slide_id: str = INSTANCE_KEY,
        section: str = "Brand Awareness and Purchase Funnel",
        template_slide_title: str = "Purchase Funnel Table",
        sc_theme: Optional[str] = None,
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
        item = dict(PURCHASE_FUNNEL_TABLE_ITEM)
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
                self.VISUAL_ID,
                client=client,
                model=model,
            )
        except Exception as exc:
            logger.warning(
                "PurchaseFunnelTableSlide: build_percentages failed: %s. Skipping.",
                exc,
            )
            return {}

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.info("PurchaseFunnelTableSlide: no data produced, skipping.")
            return {}

        return {self.INSTANCE_KEY: df.fillna(0)}

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:

        log = log or logger
        tracker: Set[int] = modified_slides if modified_slides is not None else set()

        template_index = find_slide_by_title(pres, self.template_slide_title)
        if template_index is None:
            log.warning(
                "PurchaseFunnelTableSlide: template slide '%s' not found, skipping.",
                self.template_slide_title,
            )
            return

        if not isinstance(payload, pd.DataFrame) or payload.empty:
            log.info("PurchaseFunnelTableSlide: no data, skipping populate.")
            return

        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)

        item = self._item_for_process()
        PurchaseFunnelTableSlide.populate_pf_table(
            pres,
            payload,
            item,
            tracker,
            target_slide_index=new_slide_idx,
            target_slide=new_slide,
        )

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        if not payloads or self.INSTANCE_KEY not in payloads:
            return None
        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Purchase Funnel Table.xlsx"
        try:
            df = payloads[self.INSTANCE_KEY]
            if not isinstance(df, pd.DataFrame) or df.empty:
                return None
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                df.to_excel(writer, sheet_name="Purchase Funnel Table"[:31], index=True)
            logger.info("Purchase Funnel Table Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Purchase Funnel Table Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, pd.DataFrame):
            return str(payload)[:500]
        if payload.empty:
            return "Purchase Funnel table: no data."
        return (
            "Purchase Funnel table (Awareness, Bought 12M, Bought 3M, MOU)\n\n"
            + payload.head(10).to_string(max_colwidth=20)
        )[:3000]
