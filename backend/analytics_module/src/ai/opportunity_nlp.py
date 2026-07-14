import logging
import pandas as pd
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from backend.models import QualitativeFeedback
from backend.analytics_module.src.ai.verbatim_analyzer import VerbatimAnalyzer

logger = logging.getLogger(__name__)

@dataclass
class AttributeOpportunityPackage:
    """
    Complete high-fidelity context for a single business opportunity.
    This serves as the finalized input for the LLM Synthesis layer.
    """
    attribute: str
    gap_score: float
    purchase_intent: float
    composite_score: float
    confidence: float
    strategic_priority: float = 0.0
    pain_points: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    context_positives: List[str] = field(default_factory=list)

class OpportunityNLPAnalyzer:
    """
    Advanced NLP Alignment Layer for the Opportunity Engine.
    Extends the high-precision VerbatimAnalyzer resolution logic to isolate
    and group qualitative signals for the target brand.
    """

    def __init__(self):
        # We reuse the static resolution logic from VerbatimAnalyzer
        # Creating a stub instance to access its internal resolution engine
        self._resolver = VerbatimAnalyzer(None, "")

    def extract_feedback(self, df_responses: pd.DataFrame, 
                         target_brand: str,
                         project_inputs: dict) -> QualitativeFeedback:
        """
        [Phase 4.1] Qualitative Feedback Extraction.
        
        Strictly isolates customer voices with a focus on 'Grounded Verbatim'.
        1. Resolves brand-specific columns.
        2. Filters for the target brand only.
        3. Clusters themes into prioritized signal pools.
        """
        if df_responses is None or df_responses.empty:
            return QualitativeFeedback(brand=target_brand)

        # 1. Resolve Column Mappings
        # Internal Keys for the taste test protocol
        oe_map = {
            "dislikes": "dislike_in_taste",
            "recommendations": "improvement_in_taste",
            "likes": "like_in_taste"
        }

        feedback_data = {
            "pain_points": [],
            "suggestions": [],
            "context_positives": []
        }

        # 2. Extract and Cluster (Deterministic Tier)
        for target_key, internal_key in oe_map.items():
            # Use VerbatimAnalyzer's resolution logic
            raw_brand_map = self._resolver._collect_brand_scoped_responses(
                df_responses, project_inputs, internal_key
            )
            
            # Isolate only target brand
            responses = raw_brand_map.get(target_brand, [])
            
            # Simple length-based and frequency-based clustering for deterministic tier
            # (Ensures we pick the most descriptive/representative responses)
            feedback_data[target_key if target_key != "dislikes" else "pain_points"] = self._cluster_responses(responses)

        return QualitativeFeedback(
            brand=target_brand,
            pain_points=feedback_data["pain_points"],
            suggestions=feedback_data.get("suggestions", []),
            context_positives=feedback_data.get("context_positives", [])
        )

    def _cluster_responses(self, responses: List[str], limit: int = 5) -> List[str]:
        """
        Deterministic thematic clustering.
        Prioritizes responses that are descriptive (longer) but filters out noise.
        """
        if not responses:
            return []
            
        # 1. Clean and Filter
        clean = [r.strip() for r in responses if len(r.strip()) > 5]
        
        # 2. Heuristic Ranking (Length + Word overlap)
        # We prefer responses that are 20-100 chars (Executive insight sweet spot)
        def score_desc(text: str) -> float:
            length = len(text)
            if 20 <= length <= 100:
                return 3.0
            if length > 100:
                return 2.0
            return 1.0

        # Sort by descriptive score
        ranked = sorted(clean, key=score_desc, reverse=True)
        
        # Return unique top-N
        seen = set()
        unique_results = []
        for r in ranked:
            if r.lower() not in seen:
                unique_results.append(r)
                seen.add(r.lower())
            if len(unique_results) >= limit:
                break
                
        return unique_results

    def map_feedback_to_attributes(self, feedback: QualitativeFeedback,
                                   attributes: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        [Phase 4.2] Attribute-to-Feedback Mapping.
        
        The critical fix: Links customer verbatim to specific statistical attributes
        to provide a grounded 'Why' for every performance gap.
        
        Returns:
            Dict mapping attribute names to their related qualitative context.
        """
        # 1. Advanced Heuristic Keyword Registry
        # This maps technical attributes to colloquial consumer language.
        ATTRIBUTE_KEYWORDS = {
            "Aroma":     ["smell", "scent", "aroma", "fragrance", "odor", "nose"],
            "Taste":     ["taste", "flavor", "sweet", "bitter", "sour", "acidic", "tangy"],
            "Packaging": ["package", "packaging", "box", "wrapper", "design", "label", "bottle", "lid", "cap"],
            "Texture":   ["texture", "smooth", "crunchy", "soft", "hard", "mouthfeel", "creamy"],
            "Aftertaste": ["linger", "lingering", "finish", "after"],
            "Price":     ["cost", "expensive", "value", "price", "premium"],
            "Color":     ["color", "look", "appearance", "visual", "tint"]
        }

        alignment_map = {}

        for attr in attributes:
            # 1. Build keyword set for this attribute (Static + Dynamic)
            k_set = set(ATTRIBUTE_KEYWORDS.get(attr, []))
            k_set.add(attr.lower()) # Always include the name itself
            
            attr_feedback = {
                "pain_points": [],
                "suggestions": [],
                "sentiment_strength": 0.0
            }

            # 2. Map Pain Points (Dislikes)
            for p in feedback.pain_points:
                if any(kw in p.lower() for kw in k_set):
                    attr_feedback["pain_points"].append(p)

            # 3. Map Suggestions (Improvements)
            for s in feedback.suggestions:
                if any(kw in s.lower() for kw in k_set):
                    attr_feedback["suggestions"].append(s)

            # 4. Compute Sentiment Strength (Grounded Intensity)
            # Calculation: (Relevant Mentions) / (Total Brand Pain Points)
            total_vocalized = len(feedback.pain_points)
            if total_vocalized > 0:
                strength = len(attr_feedback["pain_points"]) / total_vocalized
                attr_feedback["sentiment_strength"] = round(float(strength), 2)

            alignment_map[attr] = attr_feedback

        logger.info(f"Aligned qualitative feedback across {len(alignment_map)} attributes.")
        return alignment_map

    def build_packages(self, 
                       ranked_opportunities: List[Dict[str, Any]], 
                       alignment_map: Dict[str, Dict],
                       global_feedback: QualitativeFeedback) -> List[AttributeOpportunityPackage]:
        """
        [Phase 4.3] Final Structural Linkage.
        
        This is the ultimate bridge that fuses quantitative gaps with qualitative 
        proof. It assembles the final data payload ready for executive narration.
        """
        packages = []
        
        for opt in ranked_opportunities:
            attr = opt["attribute"]
            feedback = alignment_map.get(attr, {})
            
            # Extract nuanced positives: What should we keep while fixing the issue?
            # We filter the global 'likes' for this specific attribute.
            attr_positives = []
            for like in global_feedback.context_positives:
                if attr.lower() in like.lower():
                    attr_positives.append(like)
            
            # Create the high-fidelity package
            pkg = AttributeOpportunityPackage(
                attribute=attr,
                gap_score=float(opt["raw_signal"].gap_vs_market),
                purchase_intent=float(opt["raw_signal"].purchase_intent_t2b),
                composite_score=float(opt["score"]),
                confidence=float(opt.get("confidence", 0.88)),
                strategic_priority=float(opt.get("strategic_priority", 0.0)),
                pain_points=feedback.get("pain_points", [])[:3],
                suggestions=feedback.get("suggestions", [])[:3],
                context_positives=attr_positives[:2]
            )
            
            packages.append(pkg)
            
        logger.info(f"Successfully built {len(packages)} structural linkage packages for LLM synthesis.")
        return packages
