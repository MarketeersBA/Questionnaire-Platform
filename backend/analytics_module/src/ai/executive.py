"""
Executive Summary Synthesizer for Final PPTX Output.
Review the entire narrative for consistency and extract top-3 takeaways.
"""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.__init__ import AIGuard

logger = logging.getLogger(__name__)


class ExecutiveSynthesizer:
    """Final AI pass over all insights to generate an executive-level summary."""

    def __init__(self, insights: List[Dict[str, str]]):
        self.insights = insights

    async def generate_hero_summary(
        self,
        client,
        model: str,
        cache_manager: Optional[Any] = None,
        survey_id: str = "",
    ) -> str:
        """
        Synthesize all slide-level insights into a top-3 takeaway list.
        Useful for 'Executive Summary' slides.
        """
        if not self.insights:
            return "Analysis complete. Insufficient insights for a hero summary."

        consolidated = "\n\n".join([
            f"[Slide: {i['title']}] {i['insight']}"
            for i in self.insights if i.get("insight")
        ])

        messages = PromptOrchestrator.construct_messages(
            template_key="executive_hero",
            data=consolidated,
            model=model,
            output_budget=250,
        )

        async def _call_api():
            t0 = time.perf_counter()

            def _sync_call():
                return client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=250,
                )

            response = await asyncio.to_thread(_sync_call)
            duration_ms = (time.perf_counter() - t0) * 1000
            api_cost.add_from_openai_response(
                "executive_hero", model, response, duration_ms=duration_ms
            )
            return (response.choices[0].message.content or "").strip()

        if cache_manager and survey_id:
            return await cache_manager.get_or_execute(
                survey_id=survey_id,
                component_type="executive_hero",
                component_key="hero_takeaways",
                prompt_version=registry.get_template_version("executive_hero"),
                messages=messages,
                executor_coro=lambda: AIGuard.wrap_call_async(
                    "executive_hero", _call_api, survey_id=survey_id
                ),
            )

        return await AIGuard.wrap_call_async(
            "executive_hero", _call_api, survey_id=survey_id
        )
