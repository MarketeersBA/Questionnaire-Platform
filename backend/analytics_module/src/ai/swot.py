"""
SWOT Analyzer for Competitive Intelligence.
Synthesizes Strengths, Weaknesses, Opportunities, and Threats from comparative data.
"""
import logging
from typing import Any, Dict, List, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class SWOTAnalyzer:
    """Automated SWOT matrix generator for brand analysis."""

    @staticmethod
    def generate_swot(
        my_brand_data: pd.Series, 
        competitor_avg: pd.Series, 
        benchmark_target: float = 75.0
    ) -> Dict[str, List[str]]:
        """
        Compare individual brand performance against competitive averages 
        to populate SWOT quadrants.
        """
        swot = {"Strengths": [], "Weaknesses": [], "Opportunities": [], "Threats": []}
        
        for attr, score in my_brand_data.items():
            comp_score = competitor_avg.get(attr, score)
            
            # Strength: Outperforming competitors + absolute high score
            if score > comp_score and score >= benchmark_target:
                swot["Strengths"].append(f"Leader in {attr} (Score: {score:.1f} vs Avg: {comp_score:.1f})")
            
            # Weakness: Underperforming competitors 
            elif score < comp_score:
                swot["Weaknesses"].append(f"Gap in {attr} relative to average competitors.")
                swot["Threats"].append(f"Competitive risk at '{attr}' attribute.")
            
            # Opportunity: Industry-wide low scores where we could lead
            if score < benchmark_target and comp_score < benchmark_target:
                swot["Opportunities"].append(f"Unmet market need in '{attr}'; potential for industry leadership.")
                
        return swot
