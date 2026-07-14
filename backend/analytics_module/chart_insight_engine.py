import json
import logging
import asyncio
from pathlib import Path
from typing import Any, Dict, Tuple, List, Optional

from backend.models import ChartPayload, SurveyContextBlock
from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai import _data_to_summary, AIGuard
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.insight_cache import InsightCacheManager

logger = logging.getLogger(__name__)

def _get_prompts() -> Dict[str, Any]:
    """Retrieve chart insights prompts via the registry."""
    return registry.get_template("chart_insights")

class ChartInsightEngine:
    def __init__(self,
                 client: Any,
                 model: str,
                 my_brand: str,
                 research_type: str = "Standard",
                 archetype: Optional[str] = None,
                 cache_manager: Optional[InsightCacheManager] = None,
                 survey_id: str = "",
                 survey_context: Optional[SurveyContextBlock] = None):
        self.client = client
        self.model = model
        self.my_brand = (my_brand or "").strip()
        self.research_type = research_type
        self.archetype = archetype or "General Analyst"
        self.cache = cache_manager
        self.survey_id = survey_id
        self.survey_context = survey_context

    async def generate(self, chart: ChartPayload, section_name: str = "General Analysis") -> Tuple[str, List[Dict[str, Any]]]:
        """
        Generates dual-output insights (Headline + Deep Analysis) for a chart.
        Implements a Cache-First strategy to optimize performance and costs.
        """
        if not self.client or not self.model:
            return "", []

        p_version = registry.get_template_version("chart_insights")
        prefix_v = PromptOrchestrator.get_prefix_version()
        prompts = _get_prompts()

        # 1. Try Cache First
        if self.cache and self.survey_id:
            cached = await self.cache.get_cached(
                survey_id=self.survey_id,
                component_type="chart_insight",
                component_key=chart.chart_id,
                prompt_version=p_version,
                prefix_version=prefix_v
            )
            if cached:
                return cached["ai_headline"], cached["ai_deep_analysis"]

        # 2. Preparation for Generation
        async def _do_generate_async():
            # 1. Determine focal instructions (Brand-specific logic)
            user_extra = ""
            if self.my_brand:
                brand_in_data = any(self.my_brand.lower() in b.lower() for b in chart.brands)
                if brand_in_data:
                    user_extra = prompts.get("brand_focus_addendum", "").format(brand_name=self.my_brand)
                else:
                    user_extra = prompts.get("competitor_focus_addendum", "").format(brand_name=self.my_brand)

            # 2. ORCHESTRATED CONSTRUCTION
            messages = PromptOrchestrator.construct_messages(
                template_key="chart_insights",
                data=chart.data,
                model=self.model,
                research_type=self.research_type,
                archetype=self.archetype,
                variables={
                    "section": section_name,
                    "chart_title": chart.title,
                    "chart_type": chart.chart_type,
                    "brands": ", ".join(chart.brands) if chart.brands else "N/A",
                    "base_n": chart.base_n,
                    "brand_name": self.my_brand,
                },
                user_extra=user_extra,
                output_budget=0,
                survey_meta=self.survey_context,
            )

            # 3. DEDUP & EXECUTION
            from backend.analytics_module.src.ai.dedup import coalescer
            dedup_key = coalescer.generate_key(messages, self.model, get_response_format("chart_insights"))

            async def _call_api():
                import time
                t0 = time.perf_counter()
                
                def _sync_call():
                    return self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        response_format=get_response_format("chart_insights"),
                        max_tokens=600,
                        temperature=0,
                    )

                # 2026 Concurrency Refactor: Offload blocking I/O to thread pool
                response = await asyncio.to_thread(_sync_call)
                
                duration_ms = (time.perf_counter() - t0) * 1000
                api_cost.add_from_openai_response(
                    "chart_insights", self.model, response, 
                    duration_ms=duration_ms, prefix_version=prefix_v
                )
                content = response.choices[0].message.content or "{}"
                logger.info(f"[DEBUG] Chart {chart.chart_id} raw response: {content[:100]}...")
                return content

            result_txt = await AIGuard.wrap_call_async(
                slide_id=f"chart_{chart.chart_id}", 
                func=_call_api, 
                dedup_key=dedup_key,
                survey_id=self.survey_id
            )

            try:
                parsed = json.loads(result_txt)
                headline = parsed.get("headline", "")

                raw_insights = parsed.get("insights") or parsed.get("analysis_points", [])
                analysis = []
                for item in raw_insights:
                    analysis.append({
                        "title": item.get("title", "Insight"),
                        "body": item.get("body", ""),
                        "sentiment": item.get("sentiment", "neutral"),
                        "recommended_action": item.get("recommended_action") or "",
                    })
                
                # 4. Save to Cache
                if self.cache and self.survey_id:
                    await self.cache.set_cache(
                        survey_id=self.survey_id,
                        component_type="chart_insight",
                        component_key=chart.chart_id,
                        prompt_version=p_version,
                        prefix_version=prefix_v,
                        prompt_text=messages[1]["content"],
                        headline=headline,
                        analysis=analysis,
                        raw_response=result_txt,
                        model=self.model,
                        token_metrics={}, # metrics already in api_cost
                        cost_usd=0
                    )
                
                return headline, analysis
            except Exception as e:
                logger.error("Failed to parse/cache chart insight JSON: %s", e)
                return "", []

        return await _do_generate_async()

    def get_batch_item(self, chart: ChartPayload, section_name: str = "General Analysis") -> Optional[Dict[str, Any]]:
        """
        Prepares a single request object for the OpenAI Batch API.
        Returns a dictionary for JSONL batch file.
        """
        prompts = _get_prompts()
        summary = _data_to_summary(chart.data)
        if not summary or summary == "(No data)":
            return None

        brand_list_str = ", ".join(chart.brands) if chart.brands else "No explicit brands"
        
        batch_vars = {
            "research_type": self.research_type,
            "section": section_name,
            "archetype": self.archetype,
            "chart_title": chart.title,
            "chart_type": chart.chart_type,
            "brands": brand_list_str,
            "base_n": chart.base_n,
            "data_summary": summary,
            "brand_name": self.my_brand,
        }
        if self.survey_context:
            batch_vars.update(self.survey_context.to_prompt_variables())

        user_content = registry.format_prompt("chart_insights", batch_vars)

        if self.my_brand:
            brand_in_data = False
            bl = self.my_brand.lower()
            for b in chart.brands:
                if bl in b.lower():
                    brand_in_data = True
                    break
            if not brand_in_data and chart.data:
                if bl in summary.lower():
                    brand_in_data = True

            if brand_in_data:
                user_content += prompts.get("brand_focus_addendum", "").format(brand_name=self.my_brand)
            else:
                user_content += prompts.get("competitor_focus_addendum", "").format(brand_name=self.my_brand)

        c_id = f"{self.survey_id}|chart_{chart.chart_id}" if self.survey_id else chart.chart_id
        
        return {
            "custom_id": c_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": prompts.get("system", "")},
                    {"role": "user", "content": user_content}
                ],
                "response_format": get_response_format("chart_insights"),
                "max_tokens": 1000,
                "temperature": 0.2
            }
        }
