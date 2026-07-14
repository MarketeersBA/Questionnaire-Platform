"""HabitsOpinionsSlide — one slide per question group (sc, mc, scsc, scmc, mcmc)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from backend.analytics_module.src.MyPPTX.handlers import _handle_habits_opinions
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)


@register_slide(section="Habits")
class HabitsOpinionsSlide(DynamicSlideConcept):
    """
    Expandable slide concept: one slide per habits/opinions question group.

    Each group can contain 1 or 2 questions; the slide template is chosen
    by the type_combo string (e.g. "sc", "mc", "scsc", "scmc", "mcmc").

    Required project_inputs keys
    ----------------------------
    habits_and_opinions : list of dicts mapping question column -> display title,
                          e.g. [{"Q1": "Title 1", "Q2": "Title 2"}, {"Q3": "Title 3"}]
    """

    def __init__(
        self,
        slide_id: str = "slide_Habits_Opinions",
        section: str = "Habits",
        template_slide_title: str = "Habits and Opinions",
        sc_theme: Optional[str] = "title_18",
        mc_theme: Optional[str] = "title_18",
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)

        # Populated by load_inputs
        self.inputs_key: str = "habits_and_opinions"
        self.groups: list = []

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["habits_and_opinions"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.groups = list(project_inputs.get("habits_and_opinions") or [])
        self._inputs_loaded = True

    def _build_item(self) -> dict:
        """Build the 'item' dict expected by build_habits_opinions."""
        item = self._item_config()
        item["inputs"] = self.inputs_key
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
        from backend.analytics_module.src.Calculations.habits_opinions import build_habits_opinions

        item = self._build_item()
        raw_results: list = build_habits_opinions(item, data_store, meta_data, project_inputs)

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

        item = self._item_config()
        tracker: Set[int] = modified_slides if modified_slides is not None else set()
        _handle_habits_opinions(pres, instance_key, payload, item, log or logger, tracker)

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        """Write Habits Opinions.xlsx — one sheet per question-group instance."""
        if not payloads:
            return None

        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Habits Opinions.xlsx"

        try:
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                seen: set = set()
                for key, payload in payloads.items():
                    if not isinstance(payload, dict):
                        continue

                    data_list: List[pd.DataFrame] = payload.get("data") or []
                    titles: List[str] = payload.get("titles") or payload.get("questions") or []

                    for i, df in enumerate(data_list):
                        if not isinstance(df, pd.DataFrame) or df.empty:
                            continue
                        label = (titles[i] if i < len(titles) else f"Chart {i + 1}")
                        sheet_name = str(label)[:31]
                        original = sheet_name
                        j = 1
                        while sheet_name in seen:
                            suffix = f"_{j}"
                            sheet_name = original[:31 - len(suffix)] + suffix
                            j += 1
                        seen.add(sheet_name)
                        df.to_excel(writer, sheet_name=sheet_name, index=True)

            logger.info("Habits Opinions Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("Failed to write Habits Opinions Excel")
            return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, dict):
            return str(payload)[:500]

        parts: List[str] = [f"Habits/Opinions: {instance_key}"]
        data_list: List[pd.DataFrame] = payload.get("data") or []
        titles: List[str] = payload.get("titles") or payload.get("questions") or []

        for i, df in enumerate(data_list):
            if isinstance(df, pd.DataFrame) and not df.empty:
                label = (titles[i] if i < len(titles) else f"Chart {i + 1}")
                parts.append(f"{label}:\n{df.head(5).to_string(max_colwidth=20)}")

        return "\n\n".join(parts)[:3000]
