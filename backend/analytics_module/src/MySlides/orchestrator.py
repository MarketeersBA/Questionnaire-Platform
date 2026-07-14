"""
Comparator Orchestrator for Advanced Study Looping.
Manages brand pairings and comparison logic.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple
import itertools

logger = logging.getLogger(__name__)

class ComparatorOrchestrator:
    """
    Orchestrates the generation of comparison pairs (comparators) for research studies.
    Supports binding pairs to specific analytical segments (Phase 3) and 
    strict narrative ordering (Phase 5).
    """
    def __init__(self, project_inputs: dict):
        self.project_inputs = project_inputs

    def get_effective_comparators(self) -> List[Dict[str, Any]]:
        """
        Determine which brand pairs should be compared.
        Returns a list of dicts: [{'pair': [A, B], 'segment': 'Riyadh'}]
        """
        template = self.project_inputs.get("comparator_template")
        if template:
            pairs = self.get_templated_comparators(template)
            return [{"pair": p, "segment": None} for p in pairs]

        comparators = self.project_inputs.get("comparators") or []
        
        # Phase 3: Convert raw pairs to standardized objects
        results = []
        for item in comparators:
            if isinstance(item, list):
                results.append({"pair": item, "segment": None})
            elif isinstance(item, dict):
                results.append(item)
        
        if results:
            return results

        # Default legacy: all pairs (Round Robin)
        pairs = self.get_templated_comparators("round_robin")
        return [{"pair": p, "segment": None} for p in pairs]

    def get_templated_comparators(self, template_name: str) -> List[List[str]]:
        """Generate pairs based on a blueprint: round_robin, leader_vs_rest, etc."""
        brands = self.project_inputs.get("brands_list_full") or self.project_inputs.get("focus_brands") or []
        if not brands:
             return [] # Return empty list, not list containing empty list

        if template_name == "round_robin":
            if len(brands) >= 2:
                return [list(p) for p in itertools.combinations(brands, 2)]
        
        elif template_name == "leader_vs_rest":
            my_brand = self.project_inputs.get("my_brand")
            if my_brand and len(brands) > 1:
                return [[my_brand, b] for b in brands if b != my_brand]

        return [[]]

    def format_comparator_label(self, comparator: List[str]) -> str:
        """Human-readable label for a comparator pair."""
        if not comparator:
            return "General Analysis"
        return " vs ".join(comparator)

    def sort_comparators(self, comparators: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort pairs by a manually provided order key (Phase 5)."""
        return sorted(comparators, key=lambda x: x.get("order", 0))
