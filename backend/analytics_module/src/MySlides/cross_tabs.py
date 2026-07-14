"""CrossTabsSlide — one slide per (metric × group) cross-tabulation."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide
from backend.analytics_module.src.MyPPTX import slides, charts, textboxes, design_config

logger = logging.getLogger(__name__)


@register_slide(section="Cross Tabs")
class CrossTabsSlide(DynamicSlideConcept):
    """
    Expandable slide concept: one slide per (metric × segmentation group) combination.

    Required project_inputs keys
    ----------------------------
    ct-inputs : dict with keys:
        metrics : list[str]  survey column names to cross-tabulate
        groups  : list[str]  segmentation columns (e.g. Age, Gender, Governorate)
    """

    def __init__(
        self,
        slide_id: str = "slide_cross_tabs",
        section: str = "Cross Tabs",
        template_slide_title: str = "charts",
        sc_theme: Optional[str] = "title_18",
        mc_theme: Optional[str] = "title_18",
        sc_aggregation_method: str = "none",
        title_is_question: bool = True,
        subtitle_has_question: bool = False,
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)

        self.sc_aggregation_method = sc_aggregation_method
        self.title_is_question = title_is_question
        self.subtitle_has_question = subtitle_has_question

        # Populated by load_inputs
        self.ct_inputs_key: str = "ct-inputs"
        self.ct_inputs: dict = {}

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["ct-inputs"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.ct_inputs = dict(project_inputs.get("ct-inputs") or {})
        self._inputs_loaded = True

    def _build_item(self) -> dict:
        """Build the 'item' dict expected by build_cross_tabs."""
        item = self._item_config()
        item["inputs"] = self.ct_inputs_key
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
        from backend.analytics_module.src.Calculations.cross_tabs import build_cross_tabs

        item = self._build_item()
        raw_results: list = build_cross_tabs(item, data_store, meta_data, project_inputs)

        payloads: Dict[str, Any] = {}
        for entry in raw_results:
            if isinstance(entry, dict):
                payloads.update(entry)
        return payloads

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        _log = log or logger
        tracker: Set[int] = modified_slides if modified_slides is not None else set()

        _log.info("Cross Tab: %s", instance_key)

        if not isinstance(payload, dict):
            _log.warning("Cross Tab payload for '%s' is not a dict — skipping.", instance_key)
            return

        data: Optional[pd.DataFrame] = payload.get("data")
        bases = payload.get("bases")
        segments = payload.get("segments")
        is_sc: bool = bool(payload.get("is_sc", False))
        question_text: Optional[str] = payload.get("question_text")

        num_charts = 0 if data is None else len(data.columns)
        slide_title_suffix = f"{num_charts}-sc-charts" if is_sc else f"{num_charts}-charts"

        slide_index = slides.find_slide_by_title(pres, slide_title_suffix)
        if slide_index is None:
            raise ValueError(
                f"CrossTabsSlide '{instance_key}': no template slide found with title '{slide_title_suffix}'"
            )

        new_slide = slides.duplicate_slide(pres, slide_index)

        if is_sc:
            if self.sc_theme:
                design_config.set_chart_theme(self.sc_theme)
            charts.populate_charts_from_columns_sc(
                new_slide,
                data.T,
                instance_key.split(" ")[0],
                aggregation_method=self.sc_aggregation_method,
            )
        else:
            if self.mc_theme:
                design_config.set_chart_theme(self.mc_theme)
            charts.populate_charts_from_columns(new_slide, data, instance_key.split(" ")[0])

        textboxes.populate_base_textboxes(new_slide, segments, bases)

        if question_text and self.title_is_question:
            textboxes.set_slide_title(new_slide, question_text)
        if question_text and self.subtitle_has_question:
            textboxes.populate_subtitle_textbox(new_slide, question_text)

        tracker.add(pres.slides.index(new_slide))

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        """Write Cross Tabs.xlsx — one sheet per (metric × group) instance."""
        if not payloads:
            return None

        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Cross Tabs.xlsx"

        try:
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                seen: set = set()
                for key, payload in payloads.items():
                    if not isinstance(payload, dict):
                        continue
                    data: Optional[pd.DataFrame] = payload.get("data")
                    if data is None or not isinstance(data, pd.DataFrame) or data.empty:
                        continue

                    sheet_name = str(key)[:31]
                    original = sheet_name
                    i = 1
                    while sheet_name in seen:
                        suffix = f"_{i}"
                        sheet_name = original[:31 - len(suffix)] + suffix
                        i += 1
                    seen.add(sheet_name)

                    data.to_excel(writer, sheet_name=sheet_name, index=True)

            logger.info("Cross Tabs Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Cross Tabs Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, dict):
            return str(payload)[:500]

        parts: List[str] = [f"Cross Tab: {instance_key}"]
        data: Optional[pd.DataFrame] = payload.get("data")
        if data is not None and isinstance(data, pd.DataFrame) and not data.empty:
            parts.append(f"Data:\n{data.head(7).to_string(max_colwidth=20)}")

        segments = payload.get("segments")
        bases = payload.get("bases")
        if segments and bases:
            base_str = ", ".join(f"{s}: {bases.get(s, '?')}" for s in (segments[:5] if segments else []))
            parts.append(f"Segments (n): {base_str}")

        return "\n\n".join(parts)[:3000]
