"""BrandAnalyzerSlide — one slide per brand-analyzer view (Combined, Performance, Imagery)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)

# Default analyzer views matching slides_content.json
DEFAULT_ANALYZER_ITEMS = {
    "Combined": {
        "module": "brand_analyzer",
        "module_input": ["performance", "imagery"],
    },
    "Performance": {
        "module": "brand_analyzer",
        "module_input": ["performance"],
    },
    "Imagery": {
        "module": "brand_analyzer",
        "module_input": ["imagery"],
    },
}


@register_slide(section="Brand Analyzer")
class BrandAnalyzerSlide(DynamicSlideConcept):
    """
    Expandable slide concept: one brand-analyzer table slide per analyzer view
    (Combined, Performance, Imagery by default).

    Required project_inputs keys
    ----------------------------
    brand_analyzer_brands : list[str]  brands to include in the analysis

    The analyzer-item specs (which grid prefixes map to which view) can be
    customized via the constructor (default: Combined/Performance/Imagery as in
    slides_content.json).
    """

    def __init__(
        self,
        slide_id: str = "slide_brand_analyzer",
        section: str = "Brand Analyzer",
        template_slide_title: str = "Brand Analyzer",
        sc_theme: Optional[str] = None,
        mc_theme: Optional[str] = None,
        analyzer_items: Optional[Dict[str, dict]] = None,
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)
        self.analyzer_items: Dict[str, dict] = analyzer_items or DEFAULT_ANALYZER_ITEMS

        # Populated by load_inputs
        self.brand_analyzer_brands: List[str] = []

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["brand_analyzer_brands"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.brand_analyzer_brands = list(project_inputs.get("brand_analyzer_brands") or [])
        self._inputs_loaded = True

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
        from backend.analytics_module.src.Calculations.brand_analyzer import build_brand_analyzer_2

        if not self.brand_analyzer_brands:
            logger.info("BrandAnalyzerSlide: no brand_analyzer_brands configured, skipping.")
            return {}

        payloads: Dict[str, Any] = {}
        for visual_id, item_spec in self.analyzer_items.items():
            item = dict(item_spec)
            item["visual_id"] = visual_id
            try:
                df = build_brand_analyzer_2(
                    data_store,
                    self.brand_analyzer_brands,
                    project_inputs,
                    item,
                )
            except Exception as exc:
                logger.warning(
                    "BrandAnalyzerSlide: build_brand_analyzer_2 failed for %s: %s. Using placeholder.",
                    visual_id,
                    exc,
                )
                df = pd.DataFrame(0.0, index=["CBI"], columns=self.brand_analyzer_brands)

            if df is not None and not df.empty:
                payloads[visual_id] = df

        return payloads

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        from backend.analytics_module.src.MyPPTX.handlers import _handle_brand_analyzer

        tracker: Set[int] = modified_slides if modified_slides is not None else set()
        # _handle_brand_analyzer expects brand_analyzer_dfs dict keyed by visual_id
        brand_analyzer_dfs = {instance_key: payload}
        _handle_brand_analyzer(pres, brand_analyzer_dfs, instance_key, log or logger, tracker)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        """Write Brand Analyzer.xlsx — one sheet per view (Combined, Performance, Imagery)."""
        if not payloads:
            return None

        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Brand Analyzer.xlsx"

        try:
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                for visual_id, df in payloads.items():
                    if not isinstance(df, pd.DataFrame) or df.empty:
                        continue
                    sheet_name = str(visual_id)[:31]
                    df.to_excel(writer, sheet_name=sheet_name, index=True)

            logger.info("Brand Analyzer Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Brand Analyzer Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, pd.DataFrame):
            return str(payload)[:500]

        if payload.empty:
            return f"Brand Analyzer ({instance_key}): no data."

        return (
            f"Brand Analyzer view: {instance_key}\n\n"
            + payload.head(10).to_string(max_colwidth=20)
        )[:3000]
