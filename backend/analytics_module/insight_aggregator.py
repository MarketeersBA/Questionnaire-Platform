"""
InsightAggregator — Phase 3 hardened.

Consumes slide-level narrations and raw data to generate executive-level
report insights. Implements retry with exponential backoff and graceful
degradation when the AI API is unavailable (quota, rate-limit, network).
"""
from __future__ import annotations

import json
import logging
import time
import asyncio
from typing import List, Dict, Any, Optional

from backend.models import ReportInsights, ReportDataContext, KeyFinding, SurveyContextBlock
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.personas import PersonaManager
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai.token_budget import TokenBudget

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MAX_RETRIES = 3
_BACKOFF_BASE = 2  # seconds — actual wait: base^attempt (2, 4, 8)

_FALLBACK_SUMMARY = (
    "📊 Your data has been fully analyzed and all visual charts are ready. "
    "AI-powered narrative insights are temporarily unavailable due to high demand. "
    "The visual data below tells the complete story — explore your findings with confidence."
)

_NO_API_SUMMARY = (
    "AI insights are currently disabled in this environment. "
    "All analytical charts and data tables have been generated successfully — "
    "please explore the visual results below."
)


class InsightAggregator:
    """
    Consumes slide-level narrations and raw data to generate:
    1. Executive Summary
    2. Key Findings
    3. SWOT Analysis per brand
    4. Strategic Recommendations (4Ps)

    Graceful degradation: if the AI API fails after retries, the report
    is still returned with all charts and a professional fallback message.
    """

    def __init__(
        self,
        openai_api_key: str,
        model: str = "gpt-4o",
        client: Any = None,
    ):
        self.openai_api_key = openai_api_key
        self.model = model
        # Strict DI: use injected client only — no local fallback
        self.client = client
        if self.client is None:
            logger.warning(
                "InsightAggregator: no OpenAI client injected. "
                "AI insights will be skipped."
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def aggregate(
        self,
        context: ReportDataContext | List[Dict[str, Any]],
        research_type: str | List[str] = "Standard",
        archetype: str = "General Analyst",
        survey_context: Optional[SurveyContextBlock] = None,
    ) -> ReportInsights:
        """
        Main entry point for aggregation.
        Returns structured ReportInsights (never raises).
        """
        if self.client is None:
            return ReportInsights(executive_summary=_NO_API_SUMMARY)

        # Handle List-based input from legacy AnalyticsService calls
        if isinstance(context, list):
            # Convert simple history list + brands to a ReportDataContext
            brands = research_type if isinstance(research_type, list) else []
            context = ReportDataContext(
                narrator_history=context,
                metadata={"brands": brands}
            )
            research_type = "Standard"

        # Basic validation
        if not context.narrator_history and not context.hero_metrics:
            return ReportInsights(
                executive_summary="No data or narrations available for synthesis."
            )

        # Filter narrations
        from backend.analytics_module.src.ai import AIGuard
        valid_items = []
        for h in context.narrator_history:
            insight = h.get('narration', h.get('insight', '')).strip()
            if not insight or insight == AIGuard.FALLBACK_MSG:
                continue
            valid_items.append(h)

        # Synthesize 
        return await self._call_with_retry(context, str(research_type), archetype, survey_context)

    # ------------------------------------------------------------------
    # Retry + backoff logic
    # ------------------------------------------------------------------
    async def _call_with_retry(
        self,
        context: ReportDataContext,
        research_type: str,
        archetype: str,
        survey_context: Optional[SurveyContextBlock] = None,
    ) -> ReportInsights:
        last_error: Optional[Exception] = None

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                return await self._call_api(context, research_type, archetype, survey_context)
            except Exception as exc:
                last_error = exc
                category = self._classify_error(exc)
                logger.warning(
                    "InsightAggregator attempt %d/%d failed (%s): %s",
                    attempt,
                    _MAX_RETRIES,
                    category,
                    exc,
                )
                if category == "auth":
                    break
                if attempt < _MAX_RETRIES:
                    wait = _BACKOFF_BASE ** attempt
                    logger.info("Retrying in %ds…", wait)
                    await asyncio.sleep(wait)

        logger.error(
            "InsightAggregator: all %d retries failed. Last error: %s",
            _MAX_RETRIES,
            last_error,
        )
        return ReportInsights(executive_summary=_FALLBACK_SUMMARY)

    # ------------------------------------------------------------------
    # Core API call
    # ------------------------------------------------------------------
    async def _call_api(
        self,
        context: ReportDataContext,
        research_type: str,
        archetype: str,
        survey_context: Optional[SurveyContextBlock] = None,
    ) -> ReportInsights:
        from backend.analytics_module.src.ai import AIGuard
        from .src.ai.orchestrator import PromptOrchestrator
        
        # 1. ORCHESTRATED CONSTRUCTION
        # Extract data block from context (or default if missing)
        data_to_compact = context.hero_metrics or {}
        
        qual_bits = [f"- {theme}: {takeaway}" for theme, takeaway in context.verbatim_takeaways.items()]
        qual_block = "\n".join(qual_bits) if qual_bits else ""
        
        narr_bits = []
        for h in context.narrator_history:
             insight = h.get('narration', h.get('insight', '')).strip()
             narr_bits.append(f"- [Slide {h.get('slide_id')}]: {insight}")
        narration_block = "\n".join(narr_bits) if narr_bits else ""

        messages = PromptOrchestrator.construct_messages(
            template_key="executive_summary",
            data=data_to_compact,
            model=self.model,
            research_type=research_type,
            archetype=archetype,
            variables={
                "context": f"QUALITATIVE CONTEXT:\n{qual_block}\n\nQUANTITATIVE NARRATIVE:\n{narration_block}",
                "insights_summary": narration_block,
                "brand_name": survey_context.target_brand if survey_context else context.metadata.get("my_brand", ""),
            },
            user_extra=f"VERBATIM SUMMARY:\n{qual_block}\n\nNARRATIVE FLOW:\n{narration_block}",
            output_budget=0,
            survey_meta=survey_context,
        )
        
        # 2. DEDUP & CACHE WRAPPED EXECUTION
        from .src.ai.dedup import coalescer
        dedup_key = coalescer.generate_key(messages, self.model, get_response_format("executive_summary"))
        
        async def _call_openai():
            import asyncio
            t0 = time.perf_counter()
            # Wrap synchronous OpenAI client call in to_thread
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                response_format=get_response_format("executive_summary"),
                max_tokens=1500
            )
            duration_ms = (time.perf_counter() - t0) * 1000
            prefix_v = PromptOrchestrator.get_prefix_version()
            api_cost.add_from_openai_response(
                "executive_summary", self.model, response, 
                duration_ms=duration_ms, prefix_version=prefix_v
            )
            return json.loads(response.choices[0].message.content or "{}")

        # Use app-side cache + dedup
        from backend.analytics_module.main import SurveyAnalyzer # to get survey id if possible or use context
        survey_id = context.metadata.get("survey_id")
        
        # Attempt to find cache instance from AIGuard or Similar if not provided
        # For now, if context doesn't have it, we fall back to raw call
        
        # We need a cache manager. In the new architecture, it's shared.
        # Let's assume we can get it from AIGuard or create a local one if needed 
        # but the best is to use what we have.
        
        # Accessing cache from context if it exists (some parts of the app might inject it)
        # but ReportDataContext doesn't have it.
        # We'll use the AIGuard wrapper which handles dedup.
        
        raw_result = await AIGuard.wrap_call_async(
            "executive_summary", _call_openai, dedup_key=dedup_key, survey_id=survey_id
        )

        # MAP UNIFIED -> ReportInsights
        if isinstance(raw_result, str):
            raw_result = json.loads(raw_result)
            
        meta = raw_result.get("meta", {})
        return ReportInsights(
            executive_summary=raw_result.get("headline", ""),
            key_findings=[
                KeyFinding(label=i.get("title", ""), finding=i.get("body", ""), impact=i.get("sentiment", "neutral"))
                for i in raw_result.get("insights", [])
            ],
            brand_swot=meta.get("brand_swot", {}),
            recommendations_4p=meta.get("recommendations_4p", {
                "product": "N/A", "price": "N/A", "place": "N/A", "promotion": "N/A"
            })
        )

    # ------------------------------------------------------------------
    # Error classification
    # ------------------------------------------------------------------
    @staticmethod
    def _classify_error(exc: Exception) -> str:
        """Classify an OpenAI error into a high-level category for logging."""
        exc_type = type(exc).__name__.lower()
        exc_msg = str(exc).lower()

        if "ratelimit" in exc_type or "rate_limit" in exc_msg or "429" in exc_msg:
            return "rate_limit"
        if "auth" in exc_type or "401" in exc_msg or "api key" in exc_msg:
            return "auth"
        if "timeout" in exc_type or "timed out" in exc_msg:
            return "timeout"
        if "connection" in exc_type or "connect" in exc_msg:
            return "network"
        return "unknown"
