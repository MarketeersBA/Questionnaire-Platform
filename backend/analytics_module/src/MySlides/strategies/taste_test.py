"""
Taste Test research strategy execution (comparator-loop mapping).
"""
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from typing import Any, Dict, List, Optional, Set, Tuple
from .base import ResearchStrategy
from backend.analytics_module.src.MyPPTX.slides import _duplicate_section_header
from backend.analytics_module.src.MySlides.orchestrator import ComparatorOrchestrator

logger = logging.getLogger(__name__)

class TasteTestStrategy(ResearchStrategy):
    """
    Taste Test section strategy (comparator-loop mapping).
    Every section-set is duplicated for every brand pair.
    """
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
        orchestrator = ComparatorOrchestrator(self.project_inputs)
        comparator_entries = orchestrator.get_effective_comparators()
        
        comparators = [e['pair'] for e in comparator_entries]
        segments = [e.get('segment') for e in comparator_entries]
        
        comp_keys = []
        for i, pair in enumerate(comparators):
            key = "_".join(pair) if pair else "default"
            if segments[i]:
                key += f"_{segments[i].replace(' ', '_')}"
            comp_keys.append(key)
        
        # 1. Pre-load across concepts for efficiency
        for concept in concepts:
            try:
                concept.load_inputs(self.project_inputs)
            except Exception:
                logger.exception("Failed to load inputs for %s", type(concept).__name__)
 
        # 2. Outer loop: Comparators
        for comp_idx, comp in enumerate(comparators):
            comp_key = comp_keys[comp_idx]
            title_override = (f"{section} - {' vs '.join(comp)}" if comp else None) if len(comparators) > 1 else None
            _duplicate_section_header(pres, section, all_modified_slides, title_override=title_override, logger=logger)
 
            # 3. Inner loop: Individual concepts
            for concept in concepts:
                if not getattr(concept, "_inputs_loaded", False):
                    continue
                
                # Context Injection: Comparator context
                proj_inputs = {**self.project_inputs, "_current_comparator": comp}
                
                try:
                    payloads = concept.process(
                        data_store=data_store,
                        meta_data=meta_data,
                        meta_grids=meta_grids,
                        codebook_df=codebook_df,
                        project_inputs=proj_inputs,
                        client=client,
                        model=model,
                    )
                except Exception:
                    logger.exception("Failed to process %s", type(concept).__name__)
                    continue

                if not payloads:
                    continue

                modified_slides = set()
                for instance_key, payload in payloads.items():
                    # Generate a unique key for the comparator instance
                    unique_key = f"{instance_key}_{comp_key}"
                    raw_payloads[unique_key] = payload
                    try:
                        concept.populate(pres, unique_key, payload, modified_slides=modified_slides)
                        if modified_slides:
                            slide_idx = max(modified_slides)
                            insight_slide_map.append(
                                (unique_key, pres.slides[slide_idx], payload, concept.section)
                            )
                    except Exception:
                        logger.exception("Failed to populate slide for %s", unique_key)
                
                all_modified_slides.update(modified_slides)
                
                # Accumulate for Excel and reporting
                if not hasattr(concept, "_tt_payloads"):
                    concept._tt_payloads = {}
                for k, v in payloads.items():
                    concept._tt_payloads[f"{k}_{comp_key}"] = v

        # 4. Final Cleanup: Excel/Slide List consolidation
        for concept in concepts:
            acc = getattr(concept, "_tt_payloads", None)
            if acc:
                try:
                    concept.write_to_excel(acc, out_dir_path)
                except Exception:
                    logger.exception("Excel write failed for %s", type(concept).__name__)
                
                all_slide_entries.extend(concept.build_slide_list_entries(acc, {}))
                del concept._tt_payloads
