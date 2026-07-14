import logging
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np

from backend.analytics_module.ingestor import SurveyData
from backend.models import AttributeSignal, BrandMetadata

logger = logging.getLogger(__name__)

class OpportunityDetector:
    """
    Core statistical engine for the Opportunity-for-Improvement workflow.
    Identifies brand weaknesses by correlating directional gaps, sigma (variability),
    and purchase intent signals.
    """

    def __init__(self, data: SurveyData, survey_meta: Dict[str, Any]):
        """
        Initialize the detector with loaded survey data and metadata.
        
        Args:
            data: Immutable SurveyData container from the ingestor.
            survey_meta: Raw survey configuration/metadata (Blueprint, Config, etc.)
        """
        self.data = data
        self.survey_meta = survey_meta
        
        # Step 1.2: Strict Target Brand Isolation
        self.target_brand, self.competitors = self._resolve_target_brand()
        
        if not self.target_brand:
            logger.warning("OpportunityDetector initialized without a valid target brand.")

    def _resolve_target_brand(self) -> Tuple[str, List[str]]:
        """
        Advanced resolution of internal vs. competitor brands with strict priority.
        
        Logic:
        1. Check Research Blueprint (Primary Source)
        2. Check Taste Test Config / Internal Brands Data (Secondary Source)
        3. Validate against actual discovered brands in the data
        
        Returns:
            Tuple[target_brand_name, list_of_competitor_names]
        """
        # 0. Context check (Direct flat dict support)
        target_brand = self.survey_meta.get("my_brand") or self.survey_meta.get("own_brand") or ""
        meta_competitors: List[str] = []

        # 1. Primary: Blueprint check
        blueprint = self.survey_meta.get("blueprint")
        if blueprint:
            own_brand = blueprint.get("own_brand", "")
            if own_brand:
                target_brand = own_brand

            for b in blueprint.get("brands", []):
                name = b.get("name") if isinstance(b, dict) else getattr(b, "name", "")
                role = b.get("role") if isinstance(b, dict) else getattr(b, "role", "competitor")
                if not name:
                    continue
                if role in ("internal", "own"):
                    target_brand = name
                elif name != target_brand and name not in meta_competitors:
                    meta_competitors.append(name)

        # 2. Secondary: Taste Test Internal Brands Data
        if not target_brand:
            internal_data = self.survey_meta.get("internal_brands_data", [])
            if internal_data:
                # Take the first internal brand as the primary target
                b = internal_data[0]
                target_brand = b.get("name") if isinstance(b, dict) else getattr(b, "name", "")

        # 3. Validation: Cross-reference with discovered brands
        discovered = self.data.brand_list
        if target_brand and target_brand not in discovered:
            logger.info(f"Target brand '{target_brand}' from meta not found in data. Attempting fuzzy match...")
            # Simple fuzzy check: case-insensitive match
            for d in discovered:
                if d.lower() == target_brand.lower():
                    target_brand = d
                    break
        
        # If still no target, we cannot proceed with opportunity detection
        if not target_brand and discovered:
            logger.error("Could not resolve a target brand for opportunity detection.")

        # Data is authoritative; blueprint meta is fallback when ingest has no brands yet
        data_competitors = [b for b in discovered if b != target_brand]
        competitors = data_competitors if data_competitors else [
            c for c in meta_competitors if c != target_brand
        ]

        logger.info(f"Opportunity Detection Scope: Target='{target_brand}', Competitors={competitors}")
        return target_brand, competitors

    def detect(self, raw_signals: List[AttributeSignal]) -> List[Dict[str, Any]]:
        """
        [Phase 3.1] Candidate Detection Engine.
        
        This is the primary gateway for opportunity identification. It applies 
        strict, non-negotiable rules to filter out noise and strengths, focusing 
        the engine only on valid strategic weaknesses.
        
        Strict Rule:
        - Must have a negative gap (underperforming market)
        - AND Purchase Intent must be <= category average (meaning it's not a 'hidden strength')
        
        Returns:
            List of dictionaries containing ranked and scored candidates.
        """
        if not raw_signals:
            logger.warning("OpportunityDetector.detect called with empty signals.")
            return []

        # 1. Determine Category Baseline for Purchase Intent
        all_pi = [s.purchase_intent_t2b for s in raw_signals]
        category_avg_pi = np.mean(all_pi) if all_pi else 0
        
        # 2. Apply Rule-Based Filter
        candidates = []
        for s in raw_signals:
            is_weak = s.gap_vs_market < 0
            
            # Note: is_critical was used to prioritize emergency fixes, but 
            # for market leaders, we still want to report improvement areas.
            if is_weak:
                candidates.append(s)
            else:
                logger.debug(f"Attribute '{s.attribute}' excluded: Strength (Gap {s.gap_vs_market} >= 0)")

        if not candidates:
            # Enhanced logging for debugging
            logger.info(f"No attributes identified as opportunities for brand '{self.target_brand}'. (Signals processed: {len(raw_signals)})")
            return []

        # 3. Pipeline to Scoring & Normalization
        scored_results = self.score(candidates)
        
        # [Phase 3.2] Executive Focus Constraint
        # We select a maximum of 2 opportunities to ensure the final report is punchy
        # and focused on the 'Big Rocks' rather than individual granular failures.
        final_selection = scored_results[:2]
        
        logger.info(f"Opportunity Detection Finalized. Selected {len(final_selection)} key opportunities.")
        for idx, opt in enumerate(final_selection):
            logger.info(f"  Opportunity #{idx+1}: {opt['attribute']} (Score: {opt['score']})")
            
        return final_selection

    def get_context(self) -> Dict[str, Any]:
        """Returns the resolved brand context for downstream modules."""
        return {
            "target_brand": self.target_brand,
            "competitors": self.competitors,
            "has_competitors": len(self.competitors) > 0
        }

    def _normalize_signals(self, signals: List[AttributeSignal]) -> List[Dict[str, Any]]:
        """
        Applies mathematical min-max normalization to raw signals to ensure weighted parity.
        
        This step is critical for Phase 2 Feature Engineering, as it transforms disparate
        units (scales vs percentages) into a unified [0.0, 1.0] opportunity space.
        
        Normalization Strategy:
        - Gap: abs(negative_gap) scaled. Worst gap (e.g., -2.5) -> 1.0.
        - Sigma: Higher variability -> higher opportunity score.
        - Intent: Inverted (100 - PI%). Lower intent -> higher opportunity score.
        
        Design Rule: Only negative gaps are processed. Strengths (positive gaps) 
        are filtered out to maintain focus on 'Opportunities for Improvement'.
        """
        if not signals:
            return []

        # Step 1: Strict Filtering
        # Only attributes where the brand underperforms the market are candidates.
        target_signals = [s for s in signals if s.gap_vs_market < 0]
        if not target_signals:
            logger.info("No negative gaps detected. No opportunities identified.")
            return []

        # Step 2: Vector Extraction
        # Use abs() to convert negative gaps to positive magnitudes (worst = highest)
        gaps = np.array([abs(s.gap_vs_market) for s in target_signals])
        sigmas = np.array([s.sigma for s in target_signals])
        
        # Invert Intent: If PI is 20, opportunity magnitude is 80.
        # This aligns intent with gap and sigma (higher = more problematic).
        intents = np.array([100.0 - s.purchase_intent_t2b for s in target_signals])

        def robust_min_max(v: np.ndarray) -> np.ndarray:
            """Safe min-max normalization with edge-case handling for constant values."""
            v_min, v_max = v.min(), v.max()
            diff = v_max - v_min
            
            if diff < 1e-9:
                # If all values are identical, we assign them a high signal strength (1.0)
                # rather than 0.0, as any negative gap in isolation is still an opportunity.
                return np.ones_like(v)
            
            return (v - v_min) / diff

        norm_gaps = robust_min_max(gaps)
        norm_sigmas = robust_min_max(sigmas)
        norm_intents = robust_min_max(intents)

        # Step 3: Package result
        normalized_results = []
        for idx, signal in enumerate(target_signals):
            normalized_results.append({
                "attribute": signal.attribute,
                "raw_signal": signal,
                "norm_gap": round(float(norm_gaps[idx]), 4),
                "norm_sigma": round(float(norm_sigmas[idx]), 4),
                "norm_intent": round(float(norm_intents[idx]), 4)
            })
            
        logger.debug(f"Normalized {len(normalized_results)} signals for opportunity scoring.")
        return normalized_results

    def score(self, raw_signals: List[AttributeSignal]) -> List[Dict[str, Any]]:
        """
        [Phase 2.2 & 2.3] Advanced Feature Engineering & Composite Scoring.
        
        Transforms raw attribute signals into ranked opportunities using 
        weighted multi-dimensional analysis.
        
        Logic:
        1. Normalization: Scales and filters for negative gaps.
        2. Stability Assessment: Applies sigma as a 'double threat' only when gap is negative.
        3. Weighted Aggregation: Computes final Opportunity Score.
        """
        # 1. Normalize and filter (Deterministic Phase 1.3/2.2)
        # The filter 'gap < 0' in _normalize_signals ensures the Conditional Sigma rule.
        normalized = self._normalize_signals(raw_signals)
        
        if not normalized:
            return []

        # 2. Apply Weighted Composite Scoring (Phase 2.3)
        # 
        # WEIGHT JUSTIFICATION:
        # - Gap (50%): The primary metric of underperformance relative to the benchmark.
        # - Sigma (30%): Strategic 'Stability' signal. High variability indicates the brand 
        #   is not yet 'locked in' on this quality dimension (amplifies weakness).
        # - Intent (20%): Validation of business impact. High score here means this 
        #   attribute is actively dragging down the consumer's probability of purchase.
        
        W_GAP = 0.5
        W_SIGMA = 0.3
        W_INTENT = 0.2

        scored_results = []
        for item in normalized:
            # Weighted Decision Formula
            # W_GAP (0.5), W_SIGMA (0.3), W_INTENT (0.2)
            composite_score = (
                W_GAP * item["norm_gap"] +
                W_SIGMA * item["norm_sigma"] +
                W_INTENT * item["norm_intent"]
            )
            
            # Final Strategic Priority Model (1-100)
            priority_score = round(float(composite_score) * 100, 1)
            
            # Enrich item for downstream alignment and final serialization
            item["score"] = priority_score
            item["strategic_priority"] = priority_score
            item["gap_magnitude"] = abs(item["raw_signal"].gap_vs_market)
            item["purchase_intent"] = item["raw_signal"].purchase_intent_t2b
            item["confidence"] = 0.85 + (item["norm_gap"] * 0.1) # Intelligence-based confidence estimate
            
            scored_results.append(item)

        # 3. Final Ranking: prioritize by Strategic Gravity
        return sorted(scored_results, key=lambda x: x["score"], reverse=True)

    def _matches_attribute(self, text: str, attribute: str) -> bool:
        """
        Advanced heuristic matching for attribute-verbatim alignment.
        Uses a predefined keyword registry to link qualitative feedback to 
        quantitative metrics.
        """
        # Dictionary for mapping business attributes to common colloquial verbatim terms
        KYW_MAP = {
            "Aroma": ["smell", "scent", "aroma", "fragrance", "nose"],
            "Taste": ["flavor", "taste", "tasing", "sweet", "bitter", "sour"],
            "Packaging": ["package", "box", "design", "label", "wrapper", "bottle"],
            "Texture": ["mouthfeel", "texture", "smooth", "crunchy", "soft"],
            "Aftertaste": ["linger", "lingering", "after"],
            "Price": ["cost", "expensive", "value", "cheap", "pricey"],
            "Brand": ["image", "reputation", "logo"]
        }
        
        t = str(text).lower()
        attr_l = attribute.lower()
        
        # 1. Direct match
        if attr_l in t:
            return True
            
        # 2. Keyword registry match
        keywords = KYW_MAP.get(attribute, [])
        return any(k in t for k in keywords)

    def _compute_confidence(self, attribute: str, pain_points: List[str], 
                            total_responses: int) -> float:
        """
        [Phase 3.3] Validation Layer: Empirical Confidence Scoring.
        
        Logic: confidence = (# vocal mentions) / (total sample size N)
        
        This determines the 'Vocal Intensity' of the issue. A high confidence means
        the statistical weakness is actively recognized and complained about by 
        the consumers.
        """
        if not pain_points or total_responses == 0:
            return 0.0
            
        # Count mentions using the fuzzy heuristic matcher
        mentions = sum(1 for p in pain_points if self._matches_attribute(p, attribute))
        
        confidence = float(mentions) / float(total_responses)
        return round(min(confidence, 1.0), 3)
