"""
Sequential AI Narrator for stateful slide insight generation.
Maintains context across slides to create a cohesive story.
"""
import logging
from typing import List, Dict, Optional, Any
from .metrics import MetricsEngine

logger = logging.getLogger(__name__)

class ChronologicalNarrator:
    """
    Stateful AI Narrator that tracks what has been said in previous slides.
    Ensures that insights don't repeat the same points and follow a logical flow.
    """
    def __init__(self, client, model: str):
        self.client = client
        self.model = model
        self.history: List[Dict[str, str]] = [] # [{slide_id, title, insight}]
        self.strategy_name: str = "Standard"
        
    def set_strategy(self, strategy: str):
        """Inform the narrator of the active research strategy."""
        self.strategy_name = strategy

    def get_context_description(self) -> str:
        """Build a string describing what has been analysed so far."""
        prefix = f"RESEARCH STRATEGY: {self.strategy_name}\n"
        if not self.history:
            return prefix + "This is the first slide being analyzed."
        
        desc = prefix + "Previously analyzed slides:\n"
        for entry in self.history[-3:]: # Only keep last 3 for context to avoid token bloat
            desc += f"- {entry['title']}: {entry['insight'][:200]}...\n"
        return desc

    async def generate_stateful_insight(
        self, 
        slide_id: str, 
        slide_title: str,
        slide_data: Any,
        section: str,
        my_brand: str = "",
        archetype: Optional[str] = None
    ) -> str:
        """
        Generate insight for a slide while considering the chronological context.
        """
        from backend.analytics_module.src.ai import generate_insight
        
        context = self.get_context_description()
        
        # 1. Check for anomalies to highlight (Phase 5: AI Outlier Detection)
        import pandas as pd
        anomaly_note = ""
        if isinstance(slide_data, pd.DataFrame) and not slide_data.empty:
            try:
                anomalies = MetricsEngine.detect_stat_anomalies(slide_data)
                if anomalies:
                    anomaly_note = f"\n\n🚨 ANOMALY DETECTED: The following segments showed atypical scores: {', '.join(anomalies)}"
            except Exception:
                pass

        try:
            insight = await generate_insight(
                slide_id=slide_id,
                slide_data=slide_data,
                client=self.client,
                model=self.model,
                section=section,
                my_brand=my_brand,
                previous_context=context + anomaly_note,
                research_type=self.strategy_name,
                archetype=archetype # Phase 5: Voice Tone
            )
            
            self.history.append({
                "slide_id": slide_id,
                "title": slide_title,
                "insight": insight
            })
            return insight
        except Exception as e:
            logger.error(f"Narrator failed for {slide_id}: {e}")
            return ""

    async def batch_generate_insights(self, items: List[tuple], my_brand: str = "") -> List[str]:
        """
        Concurrency upgrade (Phase 5).
        Generates multiple insights in parallel using asyncio.gather.
        """
        import asyncio
        
        # 1. Capture current context ONCE
        # Note: Since this is parallel, individual insights won't see each other's history
        # but they will all share the history accumulated up to this point.
        
        tasks = []
        for item in items:
            instance_key, target_slide, payload, section = item
            tasks.append(self.generate_stateful_insight(
                instance_key, "Slide Instance", payload, section, my_brand
            ))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Batch narrator task failed: {r}")
                final_results.append("")
            else:
                final_results.append(r)
                
        return final_results
