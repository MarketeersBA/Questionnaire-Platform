"""
Semantic Mapping Suggester for Analytical Reports.
Drafts mappings between survey questions and slide concepts using keyword heuristics.
"""
import logging
from typing import Any, Dict, List, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class MappingSuggester:
    """Heuristic engine to suggest standard mappings for a survey."""
    
    STANDARD_PATTERNS = {
        "NPS": ["nps", "recommend", "likelihood to recommend"],
        "BrandAwareness": ["awareness", "heard of", "which brands"],
        "PurchaseIntent": ["purchase", "likelihood to buy", "pi"],
        "SensoryCluster": ["taste", "crunch", "sweetness", "appearance", "texture"],
        "Importance": ["importance", "how important"],
        "Habits": ["habit", "frequency", "how often"],
    }

    def suggest_mappings(self, meta_data: pd.DataFrame) -> Dict[str, str]:
        """
        Scan meta_data (question labels) to suggest slide concept mappings.
        Returns: {question_id: slide_concept_key}
        """
        suggestions = {}
        for _, row in meta_data.iterrows():
            q_id = str(row.get("question_id", ""))
            label = str(row.get("label", "")).lower()
            
            for concept, keywords in self.STANDARD_PATTERNS.items():
                if any(k in label for k in keywords):
                    suggestions[q_id] = concept
                    break # First match wins for the draft
                    
        return suggestions
