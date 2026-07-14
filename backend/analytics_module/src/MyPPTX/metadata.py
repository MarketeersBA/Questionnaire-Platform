"""
Metadata embedding and extraction utilities for PPTX Survey Intermediate Documents (SID).
Enables report 're-hydration' (refreshing live data from PPTX).
"""
import json
import logging
from typing import Optional, Dict, Any, Tuple
import pandas as pd

logger = logging.getLogger(__name__)

# Strategic keyword to identify SID payload in PPT properties
SID_MARKER = "SID_V1:"

class MetadataManager:
    """Manage embedded analytical metadata within PowerPoint files."""

    @staticmethod
    def embed_sid(pres, sid_data: Dict[str, Any], parent_sid: Optional[str] = None) -> None:
        """
        Embed survey metadata and its lineage into the presentation.
        """
        if parent_sid:
            sid_data["parent_sid"] = parent_sid
            
        try:
            payload = SID_MARKER + json.dumps(sid_data, ensure_ascii=False)
            pres.core_properties.keywords = payload
            logger.info("Successfully embedded SID metadata into PPTX.")
        except Exception as e:
            logger.error(f"Failed to embed SID: {e}")

    @staticmethod
    def extract_sid(pres) -> Optional[Dict[str, Any]]:
        """Extract embedded survey metadata from a presentation."""
        try:
            keywords = pres.core_properties.keywords or ""
            if keywords.startswith(SID_MARKER):
                raw_json = keywords[len(SID_MARKER):]
                return json.loads(raw_json)
        except Exception as e:
            logger.error(f"Failed to extract SID: {e}")
        return None

    def rehydrate_settings_from_pptx(self, file_path: str) -> Dict[str, Any]:
        """Restore all project configurations from an uploaded PPTX (Phase 1)."""
        from pptx import Presentation
        try:
            pres = Presentation(file_path)
            sid_data = self.extract_sid(pres)
            if not sid_data:
                return {"status": "not_found"}
            
            return {
                "status": "found",
                "sid": sid_data.get("sid"),
                "timestamp": sid_data.get("generated_at"),
                "n_size": sid_data.get("n_size"),
                "settings": sid_data.get("settings", {})
            }
        except Exception:
            logger.exception("Failed to rehydrate from PPTX")
            return {"status": "error"}

    def get_freshness_status(self, embedded_n: int, current_df: pd.DataFrame) -> Dict[str, Any]:
        """Compare embedded sample size with live data (Phase 2)."""
        current_n = len(current_df)
        if current_n > embedded_n:
            return {
                "status": "outdated",
                "delta": current_n - embedded_n,
                "message": f"Found {current_n - embedded_n} new respondents since generation."
            }
        return {"status": "up_to_date", "delta": 0}

    @staticmethod
    def attach_data_to_shape(shape, data_key: str) -> None:
        """Attach a 'Data Binding' key to a shape using its name/alt-text."""
        binding = f"BINDING:{data_key}"
        if binding not in shape.name:
            shape.name = f"{shape.name} {binding}".strip()
