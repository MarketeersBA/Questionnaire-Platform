import logging
import json
from typing import List, Dict, Any, Optional
from backend.analytics_module.src.ai.opportunity_nlp import AttributeOpportunityPackage
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.__init__ import AIGuard
from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.analytics_module.src.ai.utils import stream_json_completion
from backend.analytics_module.src.ai.prompt_registry import registry, ANALYTICS_PROMPT_SUITE_VERSION
from backend.models import OpportunityInsight, OpportunityAction

logger = logging.getLogger(__name__)

class OpportunitySynthesizer:
    """
    LLM Synthesis Layer — The 'Executive Narrator'.
    
    Architecture Rule: LLM is a FORMATTER, not a decision-maker.
    All scoring, ranking, and selection logic is computed deterministically 
    in the OpportunityDetector and OpportunityNLPAnalyzer before reaching this class.
    """

    def __init__(self, client: Any, model: str, cache_manager: Optional[InsightCacheManager] = None, survey_id: str = ""):
        self.client = client
        self.model = model
        self.cache = cache_manager
        self.survey_id = survey_id

    def _prepare_llm_context(self, packages: List[AttributeOpportunityPackage]) -> str:
        """
        [Phase 5.1] Context Preparation.
        
        Serializes high-fidelity data packages into a structured, signal-dense 
        text block for the LLM. This ensures the model receives 'What' to say, 
        leaving it no room to 'hallucinate' new opportunities or ignore data.
        """
        if not packages:
            return "No qualifying opportunities detected."

        blocks = []
        for pkg in packages:
            # We use abs() for the gap to present it to the LLM as a magnitude.
            # We provide the raw % for intent to root the narrative in reality.
            block = f"""
[OPPORTUNITY: {pkg.attribute}]
- Quantitative Deficit: {abs(pkg.gap_score):.2f} pts below market average
- Strategic Priority Score: {pkg.strategic_priority:.1f}/100 (High Gravity)
- Market Risk: Purchase Intent is currently {pkg.purchase_intent:.1f}%
- Statistical Confidence: {pkg.confidence * 100:.1f}% customer alignment
- Customer Friction (Pain Points):
  {chr(10).join([f"  * {p}" for p in pkg.pain_points[:3]]) if pkg.pain_points else "  * No specific verbatim pain points identified."}
- Customer Recommendations:
  {chr(10).join([f"  * {s}" for s in pkg.suggestions[:3]]) if pkg.suggestions else "  * No specific suggestions provided."}
- Brand Strengths to Preserve:
  {chr(10).join([f"  * {l}" for l in pkg.context_positives[:2]]) if pkg.context_positives else "  * N/A"}
"""
            blocks.append(block.strip())

        return "\n\n".join(blocks)

    async def synthesize(self, packages: List[AttributeOpportunityPackage], 
                         brand_name: str, category: str, sample_n: int,
                         testing_protocol: str = "unspecified") -> List[OpportunityInsight]:
        """
        Main entry point for generating the executive narrative.
        
        Triggers the structured LLM transformation with strict enforcement of 
        business logic and competitive anonymity.
        """
        if not packages:
            return []

        # 1. Prepare deterministic context
        opportunity_data_context = self._prepare_llm_context(packages)
        
        # 2. Check Cache
        prompt_data = registry.get_template("opportunity_summary")
        version = registry.get_template_version("opportunity_summary")
        prefix_v = PromptOrchestrator.get_prefix_version()
        
        if self.cache and self.survey_id:
            cached = await self.cache.get_cached(
                self.survey_id, "opportunity_summary", "main", version, prefix_version=prefix_v
            )
            if cached:
                logger.info(f"Cache Hit for Opportunity Summary in survey {self.survey_id}")
                return [OpportunityInsight(**o) for o in cached.get("ai_deep_analysis", [])]

        # 3. Call LLM (Orchestrated & Guarded)
        async def _call_api():
            # Combine Global God Prompt with Component-Specific System Instructions
            system_content = f"{registry.get_god_prompt()}\n\n{registry.format_custom_template(prompt_data.get('system', ''), {})}"
            
            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": registry.format_prompt("opportunity_summary", {
                    "opportunity_data": opportunity_data_context,
                    "brand_name": brand_name,
                    "category": category,
                    "testing_protocol": testing_protocol,
                    "sample_n": sample_n
                })}
            ]
            
            res = await stream_json_completion(
                client=self.client,
                model=self.model,
                messages=messages,
                response_format=get_response_format("opportunity_summary"),
                max_tokens=1000
            )
            
            from backend.analytics_module.src.ai import api_cost
            api_cost.add_from_openai_response(
                "opportunity_summary", self.model, res, prefix_version=prefix_v
            )
            
            return json.loads(res.choices[0].message.content or "{}")

        # Execute using AIGuard for concurrency control and resilience
        result = await AIGuard.wrap_call_async("opportunity_summary", _call_api, survey_id=self.survey_id)
        
        # 4. Map and Enrich (Fusing LLM prose with our deterministic scores)
        final_insights = []
        raw_opps = result.get("opportunities", [])
        
        # We zip with packages to ensure data integrity
        for i, raw in enumerate(raw_opps):
            if i >= len(packages): break
            pkg = packages[i]
            
            # Enrichment & Mapping
            final_insights.append(OpportunityInsight(
                title=raw.get("title", ""),
                insight=raw.get("insight", ""),
                strategic_category=raw.get("strategic_category", "Product"),
                impact=raw.get("impact", "Medium"),
                effort=raw.get("effort", "Medium"),
                priority_level=raw.get("priority_level", 3),
                actions=[
                    OpportunityAction(
                        action=a.get("action", ""),
                        category=a.get("category", "Tactical"),
                        index=idx
                    ) for idx, a in enumerate(raw.get("actions", []))
                ],
                score=pkg.composite_score,
                gap_magnitude=abs(pkg.gap_score),
                confidence=pkg.confidence,
                attribute=pkg.attribute
            ))

        # 5. Persist to Cache
        if self.cache and self.survey_id:
            await self.cache.set_cache(
                survey_id=self.survey_id,
                component_type="opportunity_summary",
                component_key="main",
                prompt_version=version,
                prefix_version=prefix_v,
                prompt_text=opportunity_data_context,
                headline="Opportunity Analysis",
                analysis=[o.model_dump() for o in final_insights],
                raw_response=json.dumps(result),
                model=self.model,
                token_metrics={},
                cost_usd=0
            )
            
        return final_insights
