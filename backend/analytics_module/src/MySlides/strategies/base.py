"""
Base interface for research execution strategies.
Handles the differences in how slides are iterated and populated 
depending on the research type (e.g. Standard, Taste Test).
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

class ResearchStrategy(ABC):
    """
    Abstract strategy for executing a set of slide concepts based on research type.
    """
    def __init__(self, project_inputs: dict):
        self.project_inputs = project_inputs

    @abstractmethod
    def execute_section(
        self,
        section: str,
        concepts: List[Any], # List[DynamicSlideConcept]
        data_store: Any, # PivotStore
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
        """Execute all slide concepts for a given section."""
        pass
