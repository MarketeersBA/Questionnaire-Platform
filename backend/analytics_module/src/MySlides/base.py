"""
Base class for expandable/dynamic slide concepts.

Each concrete class represents one slide *concept* (e.g. Brand Cards, Cross Tabs)
that can expand into multiple slide instances at render time (e.g. one slide per brand).

Every concept exposes five hooks:
  - load_inputs(project_inputs)      -> store what you need from project_inputs
  - process(data_store, ...)         -> Dict[str, Any]  (instance_key -> payload)
  - populate(pres, key, payload)     -> None (duplicate template + fill one instance)
  - write_to_excel(payloads, dir)    -> Optional[str]   (path written, or None)
  - get_insight_summary(key, payload)-> str             (text for LLM)
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)


class DynamicSlideConcept(ABC):
    """
    Abstract base for one expandable slide concept.

    Constructor params
    ------------------
    slide_id : str
        Unique id used as prefix when building per-instance slide ids (e.g. "slide_brand_card").
    section : str
        Section name as shown in the report (e.g. "Brand Cards").
    template_slide_title : str
        Title of the template slide in the PPTX that should be duplicated.
    sc_theme : str | None
        Chart theme key for single-choice charts (passed to design_config).
    mc_theme : str | None
        Chart theme key for multiple-choice charts.
    """

    def __init__(
        self,
        slide_id: str,
        section: str,
        template_slide_title: str = "",
        sc_theme: Optional[str] = None,
        mc_theme: Optional[str] = None,
    ) -> None:
        self.slide_id = slide_id
        self.section = section
        self.template_slide_title = template_slide_title
        self.sc_theme = sc_theme
        self.mc_theme = mc_theme
        # Phase 2: Structural Integrity Mapping
        self.required_scale_type: Optional[str] = None # 'scale_1_5', 'nps', 'checkbox', etc.

    def check_compatibility(self, question_meta: Dict[str, Any]) -> bool:
        """Verify if a question meets the slide's analytical requirements."""
        if not self.required_scale_type:
            return True # No requirements
        
        q_type = question_meta.get("type", "").lower()
        if self.required_scale_type == "nps" and q_type != "scale_0_10":
            return False
        if self.required_scale_type == "checkbox" and q_type not in ["checkbox", "multihot"]:
            return False
        return True
        self._inputs_loaded = False

    # ------------------------------------------------------------------
    # Abstract hooks — must be implemented by every concrete subclass
    # ------------------------------------------------------------------

    @classmethod
    @abstractmethod
    def required_input_keys(cls) -> List[str]:
        """
        Return the list of keys this concept needs from project_inputs.
        Used for validation and documentation.
        """

    @abstractmethod
    def load_inputs(self, project_inputs: dict) -> None:
        """
        Read the relevant keys from project_inputs and store them on self.
        Called once before process().
        """

    @abstractmethod
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
        """
        Compute one payload per instance.

        Returns
        -------
        dict mapping instance_key (str) -> payload (Any).
        Empty dict means no slides to generate for this concept.
        """

    @abstractmethod
    def populate(
        self,
        pres,
        instance_key: str,
        payload: Any,
        modified_slides: Optional[set] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        """
        Duplicate the template slide in *pres* and fill it with *payload*.
        One call per (instance_key, payload) pair from process().
        """

    # ------------------------------------------------------------------
    # Optional hooks — have sensible defaults
    # ------------------------------------------------------------------

    def write_to_excel(
        self,
        payloads: Dict[str, Any],
        base_dir: Path,
    ) -> Optional[str]:
        """
        Write processed data to Excel.

        Default: no-op (returns None).  Override to produce an Excel file.

        Returns
        -------
        str path of the file written, or None if nothing was written.
        """
        return None

    def get_insight_summary(self, instance_key: str, payload: Any) -> str:
        """
        Return a short text summary of *payload* suitable for an LLM prompt.

        Default: let the existing _data_to_summary helper handle it.
        Override to produce a concept-specific summary.
        """
        try:
            from backend.analytics_module.src.ai import _data_to_summary
            return _data_to_summary(payload)
        except Exception:
            return str(payload)[:500]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def build_slide_list_entries(
        self,
        payloads: Dict[str, Any],
        insights: Optional[Dict[str, str]] = None,
    ) -> List[dict]:
        """
        Build slide-list-compatible dicts (same shape as config_loader's build_slide_list)
        for each instance, so the rest of the pipeline (recommendations, etc.) can consume them.
        """
        insights = insights or {}
        entries = []
        for key, payload in payloads.items():
            entries.append({
                "slide_id": key,
                "type": "dynamic",
                "section": self.section,
                "template_slide_title": self.template_slide_title,
                "dynamic_key": key,
                "dynamic_class_name": type(self).__name__,
                "data": payload,
                "insight": insights.get(key, ""),
                "items": [],
                "items_ids": [],
            })
        return entries

    def _item_config(self) -> dict:
        """Build a minimal 'item' dict that matches what the legacy build_* functions expect."""
        return {
            "sc_theme": self.sc_theme,
            "mc_theme": self.mc_theme,
        }
