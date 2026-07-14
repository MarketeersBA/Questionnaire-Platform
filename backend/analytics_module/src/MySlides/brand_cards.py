"""BrandCardSlide — one slide per focus brand, showing PF + why-MOU chart."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)


@register_slide(section="Brand Cards")
class BrandCardSlide(DynamicSlideConcept):
    """
    Expandable slide concept: one brand-card slide per focus brand.

    Required project_inputs keys
    ----------------------------
    focus_brands        : list[str]  brands to produce a card for
    loop_why_mou        : str        column name for the "why MOU" loop question
    mou                 : str        column name for the MOU (brand used most often)

    The purchase-funnel spec (which columns map to each funnel step) is passed
    directly in the constructor (default matches the current slides_content.json spec).
    """

    DEFAULT_PURCHASE_FUNNEL_SPEC = {
        "Total Awareness": ["tom", "unaided", "aided"],
        "Consideration":   "consideration",
        "Trial":           "trial",
        "Repurchase":      "repurchase",
        "MOU":             "mou",
        "Order_By":        "Total Awareness",
    }

    def __init__(
        self,
        slide_id: str = "slide_brand_card",
        section: str = "Brand Cards",
        template_slide_title: str = "Brand Card",
        sc_theme: Optional[str] = None,
        mc_theme: Optional[str] = None,
        purchase_funnel_spec: Optional[dict] = None,
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)
        self.purchase_funnel_spec: dict = purchase_funnel_spec or self.DEFAULT_PURCHASE_FUNNEL_SPEC

        # Populated by load_inputs
        self.focus_brands: List[str] = []
        self.loop_why_mou_key: str = ""   # project_inputs key name
        self.focus_brands_key: str = "focus_brands"

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["focus_brands", "loop_why_mou"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.focus_brands = list(project_inputs.get("focus_brands") or [])
        self.loop_why_mou_key = project_inputs.get("loop_why_mou") or ""
        self._inputs_loaded = True

    def _build_item(self) -> dict:
        """Build the 'item' dict expected by build_brand_cards."""
        item = self._item_config()
        item["inputs"] = {
            "focus_brands":   self.focus_brands_key,
            "loop_question":  "loop_why_mou",
            "purchase_funnel": self.purchase_funnel_spec,
        }
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
        from backend.analytics_module.src.Calculations.brand_cards import build_brand_cards

        item = self._build_item()
        raw_results: list = build_brand_cards(data_store, project_inputs, item, meta_data, meta_grids)

        payloads: Dict[str, Any] = {}
        for entry in raw_results:
            if isinstance(entry, dict):
                # entry is like {"Brand-X Brand Card": payload}
                for k, p in entry.items():
                    # Identify brand from the key if not already present
                    if "brand_name" not in p:
                         p["brand_name"] = k.replace(" Brand Card", "").strip()
                    payloads[k] = p
        return payloads

    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[Set[int]] = None,
        log: Optional[logging.Logger] = None,
    ) -> None:
        from backend.analytics_module.src.MyPPTX.handlers import _handle_brand_card_single

        tracker: Set[int] = modified_slides if modified_slides is not None else set()
        _handle_brand_card_single(pres, instance_key, payload, log or logger, tracker)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        """Write Brand Cards.xlsx — one sheet per brand with PF and why-MOU data."""
        if not payloads:
            return None

        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Brand Cards.xlsx"

        sheets: Dict[str, pd.DataFrame] = {}
        for brand_key, payload in payloads.items():
            if not isinstance(payload, dict):
                continue
            brand_name = " ".join(str(brand_key).split(" ")[:-2]) or str(brand_key)

            pf: Optional[pd.DataFrame] = payload.get("pf")
            why: Optional[pd.DataFrame] = payload.get("why_mou")
            n = payload.get("why_mou_n")

            rows: List[pd.DataFrame] = []
            if pf is not None and isinstance(pf, pd.DataFrame) and not pf.empty:
                rows.append(pf)
            if why is not None and isinstance(why, pd.DataFrame) and not why.empty:
                header_row = pd.DataFrame([[""] * len(why.columns)], columns=why.columns,
                                          index=[f"-- Why MOU (n={n}) --"])
                rows.append(header_row)
                rows.append(why)

            if rows:
                combined = pd.concat(rows)
                sheet_name = brand_name[:31]
                sheets[sheet_name] = combined

        if not sheets:
            return None

        try:
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                for sheet_name, df in sheets.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=True)
            logger.info("Brand Cards Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Brand Cards Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, dict):
            return str(payload)[:500]

        brand_name = " ".join(str(instance_key).split(" ")[:-2]) or str(instance_key)
        parts: List[str] = [f"Brand Card: {brand_name}"]

        pf: Optional[pd.DataFrame] = payload.get("pf")
        if pf is not None and isinstance(pf, pd.DataFrame) and not pf.empty:
            parts.append(f"Purchase Funnel:\n{pf.to_string(max_colwidth=20)}")

        why: Optional[pd.DataFrame] = payload.get("why_mou")
        n = payload.get("why_mou_n")
        if why is not None and isinstance(why, pd.DataFrame) and not why.empty:
            parts.append(f"Why MOU (n={n}):\n{why.head(5).to_string(max_colwidth=20)}")

        return "\n\n".join(parts)[:3000]
