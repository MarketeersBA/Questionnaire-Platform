"""RecommendationSlide — four 4-Ps recommendation slides (Product, Price, Place, Promotion)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

from backend.analytics_module.src.MyPPTX import textboxes
from backend.analytics_module.src.MyPPTX.slides import find_slide_index_by_title_exact, duplicate_slide
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)

# Match MyModules.MyPPTX: Recommendations - 1..4 → Product, Price, Place, Promotion
_REC_SPEC: Tuple[Tuple[str, str], ...] = (
    ("Recommendations - 1", "Product"),
    ("Recommendations - 2", "Price"),
    ("Recommendations - 3", "Place"),
    ("Recommendations - 4", "Promotion"),
)

SLIDE_ID_PREFIX = "slide_recommendations"


def _instance_key(idx: int) -> str:
    return f"{SLIDE_ID_PREFIX}_{idx}"


@register_slide(section="Recommendations")
class RecommendationSlide(DynamicSlideConcept):
    """
    One concept, four slide instances: duplicates templates titled
    "Recommendations - 1" … "Recommendations - 4" and fills bullet placeholders.

    Run only when ``project_inputs["w_recommendations"]`` is true (see ``run_MySlides``);
    not selected via ``sections``.

    Optional project_inputs key
    ---------------------------
    recommendations : dict
        Same shape as ``generate_recommendations`` output: keys Product, Price,
        Place, Promotion; each value is a list of bullet strings. Missing keys
        or missing ``recommendations`` → slides are still duplicated with empty
        bullets (templates kept, matching MyPPTX behaviour).
    """

    def __init__(
        self,
        slide_id: str = SLIDE_ID_PREFIX,
        section: str = "Recommendations",
        template_slide_title: str = "Recommendations - 1",
        sc_theme: Optional[str] = None,
        mc_theme: Optional[str] = None,
    ) -> None:
        super().__init__(slide_id, section, template_slide_title, sc_theme, mc_theme)
        self._rec: Dict[str, List[str]] = {}

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return []

    def load_inputs(self, project_inputs: dict) -> None:
        raw = project_inputs.get("recommendations") or {}
        self._rec = {}
        if isinstance(raw, dict):
            for _title, p_key in _REC_SPEC:
                val = raw.get(p_key)
                if isinstance(val, list):
                    self._rec[p_key] = [str(x).strip() for x in val if str(x).strip()]
                else:
                    self._rec[p_key] = []
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
        out: Dict[str, Any] = {}
        for idx, (template_title, p_key) in enumerate(_REC_SPEC, start=1):
            bullets = list(self._rec.get(p_key) or [])
            out[_instance_key(idx)] = {
                "p_key": p_key,
                "template_title": template_title,
                "bullets": bullets,
            }
        return out

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

        if not isinstance(payload, dict):
            log.warning("RecommendationSlide: invalid payload for %s", instance_key)
            return

        template_title = payload.get("template_title") or ""
        p_key = payload.get("p_key") or ""
        bullets = payload.get("bullets") or []

        template_index = find_slide_index_by_title_exact(pres, template_title)
        if template_index is None:
            log.warning(
                "RecommendationSlide: template '%s' not found (exact title), skipping %s.",
                template_title,
                instance_key,
            )
            return

        new_slide = duplicate_slide(pres, template_index)
        new_slide_idx = pres.slides.index(new_slide)
        tracker.add(new_slide_idx)

        textboxes.populate_subtitle_textbox(new_slide, p_key)
        if textboxes.set_recommendations_bullets(new_slide, bullets):
            log.info(
                "RecommendationSlide: populated '%s' (%s) with %d bullets.",
                template_title,
                p_key,
                len(bullets),
            )
        else:
            log.warning(
                "RecommendationSlide: duplicated '%s' but no 'Write Recommendations Here' shape found.",
                template_title,
            )

    def write_to_excel(self, payloads: Dict[str, Any], base_dir: Path) -> Optional[str]:
        if not payloads:
            return None
        base_dir = Path(base_dir)
        base_dir.mkdir(parents=True, exist_ok=True)
        out_path = base_dir / "Recommendations.xlsx"
        try:
            with pd.ExcelWriter(str(out_path), engine="xlsxwriter") as writer:
                for idx, (_template_title, p_key) in enumerate(_REC_SPEC, start=1):
                    key = _instance_key(idx)
                    pl = payloads.get(key) or {}
                    bullets = pl.get("bullets") if isinstance(pl, dict) else []
                    rows = [{"bullet": b} for b in (bullets or [])]
                    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["bullet"])
                    sheet = p_key[:31]
                    df.to_excel(writer, sheet_name=sheet, index=False)
            logger.info("RecommendationSlide: Excel written to %s", out_path)
            return str(out_path)
        except Exception:
            logger.exception("RecommendationSlide: failed to write Excel")
            return None

    def build_slide_list_entries(
        self,
        payloads: Dict[str, Any],
        insights: Optional[Dict[str, str]] = None,
    ) -> List[dict]:
        insights = insights or {}
        entries: List[dict] = []
        for key, payload in payloads.items():
            template_title = self.template_slide_title
            if isinstance(payload, dict) and payload.get("template_title"):
                template_title = payload["template_title"]
            entries.append({
                "slide_id": key,
                "type": "dynamic",
                "section": self.section,
                "template_slide_title": template_title,
                "dynamic_key": key,
                "data": payload,
                "insight": insights.get(key, ""),
                "items": [],
                "items_ids": [],
            })
        return entries

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        if not isinstance(payload, dict):
            return str(payload)[:500]
        p_key = payload.get("p_key", "")
        bullets = payload.get("bullets") or []
        lines = "\n".join(f"- {b}" for b in bullets[:20])
        return f"{p_key} recommendations:\n{lines}"[:3000]
