import logging
import json
from typing import Dict, Any, Optional, List
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.__init__ import AIGuard
from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.analytics_module.src.ai.utils import stream_json_completion
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai import api_cost

logger = logging.getLogger(__name__)

class MarketPositionSynthesizer:
    """
    [Task 2.3] Market Position AI Synthesizer.
    Transforms raw statistical sigma/AAI results into a definitive executive 
    positioning verdict using structured LLM synthesis.
    """

    def __init__(self, client: Any, model: str, cache_manager: Optional[InsightCacheManager] = None, survey_id: str = ""):
        self.client = client
        self.model = model
        self.cache = cache_manager
        self.survey_id = survey_id

    def _prepare_affinity_summary(self, affinity_data: List[Dict[str, Any]]) -> str:
        """Flattens raw AAI data into a readable summary for the AI."""
        if not affinity_data:
            return "No significant affinities detected."
        
        lines = []
        # Sort by AAI descending
        sorted_data = sorted(affinity_data, key=lambda x: x.get("aai", 0), reverse=True)
        for d in sorted_data[:10]: # Top 10 for context
            lines.append(f"- {d['field']}:{d['segment']} -> AAI: {d['aai']} (Target Population: {d['p_obs']}%)")
        
        return "\n".join(lines)

    async def synthesize(self, 
                         brand_name: str, 
                         category: str,
                         research_type: str,
                         sigma_results: Dict[str, Any],
                         affinity_results: Dict[str, Any],
                         matrix_results: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Main orchestration entry point.
        """
        if not sigma_results or not matrix_results:
            logger.warning("Missing statistical results for Market Position Synthesis.")
            return None

        # 1. Extraction of Core Metrics (Phase 1 logic)
        target_sigma = sigma_results.get("data", {}).get("target_brand_analysis", {})
        if not target_sigma:
            logger.warning(f"No sigma results found for brand: {brand_name}")
            return None

        sigmas = target_sigma.get("sigmas", {})
        
        # Matrix coordinates
        points = matrix_results.get("data", {}).get("datasets", [{}])[0].get("data", [])
        target_point = next((p for p in points if p.get("is_target")), {})
        
        # Top Competitor detection (highest share or highest sigma)
        competitors = [p for p in points if not p.get("is_target")]
        top_comp = sorted(competitors, key=lambda x: x.get("share_pct", 0), reverse=True)[0] if competitors else {"brand": "Unidentified"}

        # 2. Variable Preparation
        affinity_summary = self._prepare_affinity_summary(affinity_results.get("data", {}).get("core_audience", []))
        
        variables = {
            "brand_name": brand_name,
            "category": category,
            "research_type": research_type,
            "base_n": sigma_results.get("base_n", 0),
            "mou_sigma": sigmas.get("mou", 0),
            "performance_sigma": target_point.get("y", 0),
            "geo_sigma": sigmas.get("geographic", 0),
            "affinity_summary": affinity_summary,
            "calculated_archetype": target_point.get("quadrant", "Unclassified"),
            "top_competitor": top_comp.get("brand", "N/A")
        }

        # 3. Check Cache
        prompt_data = registry.get_template("market_position")
        version = registry.get_template_version("market_position")
        prefix_v = PromptOrchestrator.get_prefix_version()

        if self.cache and self.survey_id:
            cached = await self.cache.get_cached(
                self.survey_id, "market_position", brand_name, version, prefix_version=prefix_v
            )
            if cached:
                logger.info(f"Market Position Cache Hit for {brand_name}")
                return cached.get("report", {})

        # 4. LLM Execution
        async def _call_api():
            system_content = f"{registry.get_god_prompt()}\n\n{registry.format_custom_template(prompt_data.get('system', ''), {})}"
            
            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": registry.format_prompt("market_position", variables)}
            ]

            res = await stream_json_completion(
                client=self.client,
                model=self.model,
                messages=messages,
                response_format=get_response_format("market_position"),
                max_tokens=1500
            )

            # Record metrics
            api_cost.add_from_openai_response(
                "market_position", self.model, res, prefix_version=prefix_v
            )

            return json.loads(res.choices[0].message.content or "{}")

        # Execute guarded call
        result = await AIGuard.wrap_call_async("market_position", _call_api, survey_id=self.survey_id)

        # 5. Persistence
        if self.cache and self.survey_id and result:
            await self.cache.set_cache(
                survey_id=self.survey_id,
                component_type="market_position",
                component_key=brand_name,
                prompt_version=version,
                prefix_version=prefix_v,
                prompt_text=json.dumps(variables),
                headline=f"Market Position: {brand_name}",
                analysis=[], # Store rich object in report instead
                raw_response=json.dumps(result),
                model=self.model,
                token_metrics={},
                cost_usd=0,
                extra_data={"report": result} # Custom field for cache
            )

        return result
