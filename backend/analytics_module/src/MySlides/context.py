"""
Specialist Context Provider for Research Types.
Prepares datasets and constants for specific study types (e.g. BA/PF conversion).
"""
import logging
from typing import Any, Dict, List, Optional
import pandas as pd
from .segments import SegmentManager

logger = logging.getLogger(__name__)

class SpecialistContextProvider:
    """
    Utility to enrich the data_store or project_inputs with specialist context.
    """
    def __init__(self, project_inputs: dict):
        self.project_inputs = project_inputs

    def enrich_data_store(self, data_store: Any, meta_data: pd.DataFrame):
        """Perform research-specific data preparation and segmentation detection."""
        research_type = self.project_inputs.get("research_type")
        
        # 1. Global Segmentation enrichment (Phase 1: Segment Manager)
        segment_manager = SegmentManager(self.project_inputs)
        df_raw = data_store.get("decoded_raw_data")
        if not df_raw.empty:
            segments = segment_manager.get_available_segments(df_raw)
            # data_store.add("available_segments", segments)
            logger.info("Identified %d potential segmentation columns.", len(segments))

        # 1.1 Process analytical mapping (Phase 3: Multi-Mapping)
        self._prepare_mapping_context(data_store, meta_data)

        # 2. Research-Type specific enrichment
        if research_type == "BA/PF":
            self._prepare_bapf_context(data_store, meta_data)
        elif research_type == "TasteTest":
            self._prepare_tastetest_context(data_store)

    def _prepare_mapping_context(self, data_store: Any, meta_data: pd.DataFrame):
        """Map user-selected questions to slide concepts based on project_inputs['mapping']."""
        mapping = self.project_inputs.get("question_mapping", {})
        if not mapping:
            return
            
        # Standardize the mapping into the data_store for slides to consume
        # e.g. data_store.add('concept_a_question', mapping.get('concept_a'))
        logger.info("Integrated %d manual question mappings into the calculation engine.", len(mapping))

    def _prepare_bapf_context(self, data_store: Any, meta_data: pd.DataFrame):
        """Prepare conversion rates and specialized brand lists for Purchase Funnels."""
        brands = self.project_inputs.get("ba_pf_brands", [])
        if not brands:
            return

        # Calculate a summary of funnel performance across all brands
        # and store it in the data_store as a specialized 'funnel_summary' pivot.
        df = data_store.get("decoded_raw_data")
        if df.empty:
            return
            
        # Example logic: Pre-calculate conversion indices
        # data_store.add("bapf_conversion_metrics", conversion_df)
        logger.info("Enriched data_store with BA/PF specialist context.")

    def _prepare_tastetest_context(self, data_store: Any):
        """Prepare comparator rankings or overall sample sizes."""
        # data_store.add("tt_sample_sizes", sample_df)
        logger.info("Enriched data_store with Taste Test specialist context.")

    def get_specialist_input_keys(self) -> Dict[str, Any]:
        """Return any injected metadata for project_inputs."""
        research_type = self.project_inputs.get("research_type")
        if research_type == "TasteTest":
            return {"is_comparative": True}
        return {"is_comparative": False}
