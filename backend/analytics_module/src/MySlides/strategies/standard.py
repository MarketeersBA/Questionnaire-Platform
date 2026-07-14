"""
Standard research strategy execution (1:1 slide mapping).
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple
from .base import ResearchStrategy

logger = logging.getLogger(__name__)

class StandardStrategy(ResearchStrategy):
    """
    Standard section strategy: parallel process, sequential populate.
    Supports recursive burst looping (Phase 3).
    """
    
    def __init__(self, project_inputs: dict):
        self.project_inputs = project_inputs
        self.burst_mode = bool(project_inputs.get("burst_mode", False))
        # active_segments: [{'col': 'Age', 'val': 1, 'label': '18-24'}]
        self.active_segments = project_inputs.get("active_segments", [])

    def execute_section(
        self,
        section: str,
        concepts: List[Any],
        data_store: Any,
        meta_data: Any,
        meta_grids: Any,
        codebook_df: Any,
        pres: Any,
        out_dir_path: Any,
        all_modified_slides: Set[int],
        all_slide_entries: List[dict],
        insight_slide_map: List[Tuple],
        raw_payloads: Dict[str, Any],
        client: Optional[Any] = None,
        model: Optional[str] = None
    ) -> None:
        
        # Phase 3: Recursive Burst Looping
        segments_to_run = self.active_segments if (self.burst_mode and self.active_segments) else [None]
        
        for segment in segments_to_run:
            if segment:
                data_store.add("current_segment_filter", segment)
                logger.info("Starting burst loop for segment: %s", segment.get('label'))
 
            # Phase 4: Filter-bound concept processing
            def _process_concept(concept):
                concept_id = type(concept).__name__
                if segment and not self._is_concept_bound_to_segment(concept_id, segment):
                    return concept, None
                    
                try:
                    concept.load_inputs(self.project_inputs)
                    payloads = concept.process(
                        data_store=data_store,
                        meta_data=meta_data,
                        meta_grids=meta_grids,
                        codebook_df=codebook_df,
                        project_inputs=self.project_inputs,
                        client=client,
                        model=model,
                    )
                    return concept, payloads
                except Exception:
                    logger.exception("Failed to process standard concept %s", type(concept).__name__)
                    return concept, None

            # Execute parallel processing per segment
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(_process_concept, c) for c in concepts]
                for future in as_completed(futures):
                    concept, payloads = future.result()
                    if not payloads:
                        continue
                    
                    modified_slides = set()
                    for instance_key, payload in payloads.items():
                        try:
                            # Adjust title or footer if segmented
                            label = segment.get('label', 'Seg') if segment else None
                            display_key = f"{instance_key} ({label})" if label else instance_key
                            
                            raw_payloads[display_key] = payload
                            
                            concept.populate(pres, display_key, payload, modified_slides=modified_slides)
                            if modified_slides:
                                slide_idx = max(modified_slides)
                                insight_slide_map.append(
                                    (display_key, pres.slides[slide_idx], payload, concept.section)
                                )
                        except Exception:
                            logger.exception("Failed to populate slide for %s / %s", type(concept).__name__, instance_key)
                    
                    all_modified_slides.update(modified_slides)
                    try:
                        concept.write_to_excel(payloads, out_dir_path)
                    except Exception:
                        logger.exception("Failed to write Excel for %s", type(concept).__name__)
                    
                    all_slide_entries.extend(concept.build_slide_list_entries(payloads, {}))

    def _is_concept_bound_to_segment(self, concept_name: str, segment_info: Dict[str, Any]) -> bool:
        """Verify if a slide concept should be generated for this specific segment (Phase 4)."""
        # mapping = self.project_inputs.get("concept_segment_mapping", {})
        # return concept_name in mapping.get(segment_info.get('id', 'all'), [concept_name])
        return True # Default to inclusive
