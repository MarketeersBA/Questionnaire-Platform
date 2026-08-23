"""
Generate short insight text per slide using an LLM, given slide data (dataframes or payloads).
"""
from __future__ import annotations

import json
import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import pandas as pd

from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai.recommendation_logger import (
    attach_recommendation_trace_handler,
    trace_recommendation_prompt,
)
from .personas import PersonaManager
from .token_budget import TokenBudget
from .compaction import compact_data
from .orchestrator import PromptOrchestrator
from .dedup import coalescer

logger = logging.getLogger(__name__)


from backend.analytics_module.src.ai.utils import parse_json_robustly, stream_json_completion


def _record_usage(component: str, model: str, response: Any, duration_ms: float = 0, ttft_ms: float = 0) -> None:
    """Record token usage and Latency from OpenAI-style response to api_cost."""
    try:
        api_cost.add_from_openai_response(component, model, response, duration_ms=duration_ms, ttft_ms=ttft_ms)
    except Exception:
        pass

# Max characters of data to send to the API to avoid token limits
MAX_DATA_SUMMARY_CHARS = 3000


def _data_to_summary(data: Any, max_chars: int = 3000) -> str:
    """
    Semantic Data Summary Engine.
    Uses the DataCompactor to extract statistical signals rather than raw rows.
    """
    if data is None or (isinstance(data, pd.DataFrame) and data.empty):
        return "(No data)"
    
    # Use the advanced compaction pipeline
    return compact_data(data, max_chars)


# Sections where we ask for advice focused on the client's brand (my_brand)
BRAND_FOCUS_SECTIONS = {"Brand Awareness and Purchase Funnel", "Brand Cards"}


def _my_brand_in_data(slide_data: Any, my_brand: str) -> bool:
    """Return True if my_brand appears in any DataFrame's index or columns within slide_data."""
    brand = (my_brand or "").strip()
    if not brand:
        return False

    def in_df(df: pd.DataFrame) -> bool:
        if df is None or not isinstance(df, pd.DataFrame) or df.empty:
            return False
        brand_lower = brand.lower()
        try:
            for s in df.index:
                if brand_lower in str(s).lower():
                    return True
        except Exception:
            pass
        try:
            for c in df.columns:
                if brand_lower in str(c).lower():
                    return True
        except Exception:
            pass
        return False

    if slide_data is None:
        return False
    if isinstance(slide_data, pd.DataFrame):
        return in_df(slide_data)
    if isinstance(slide_data, dict):
        for k, v in slide_data.items():
            if isinstance(v, pd.DataFrame):
                if in_df(v):
                    return True
            elif k == "data" and isinstance(v, list):
                for item in v:
                    if isinstance(item, pd.DataFrame) and in_df(item):
                        return True
    return False


# Advanced Systematic Prompt Management
from .prompt_registry import registry, ANALYTICS_PROMPT_SUITE_VERSION

def _get_prompts():
    """
    Standardize prompt retrieval across the system using the Registry.
    Maintains facade for backward compatibility while using the advanced loader.
    """
    # Simply reload if needed, but registry handles its own state
    return {
        "insights": registry.get_template("slide_insights"),
        "recommendations": registry.get_template("recommendations"),
        "verbatim": registry.get_template("verbatim_analysis"),
        "executive": registry.get_template("executive_summary")
    }

class AIGuard:
    """Interceptors for AI API calls to handle quota/rate limits gracefully."""
    
    FALLBACK_MSG = "Insight generation skipped — explore the data visually."
    quota_monitor: Optional['QuotaMonitor'] = None  # Injected at startup

    @staticmethod
    def is_quota_error(exc: Exception) -> bool:
        """Heuristic to detect 429 / Quota / Rate Limit / Timeout errors across client types."""
        msg = str(exc).lower()
        name = type(exc).__name__.lower()
        # Retrying on 429s and Timeouts as they are usually transient
        return any(x in msg or x in name for x in ["429", "quota", "rate_limit", "ratelimit", "timeout"])

    @classmethod
    def wrap_call(cls, slide_id: str, func, *args, **kwargs) -> str:
        """Executes an AI call with automatic fallback for quota errors (Synchronous)."""
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if cls.is_quota_error(e):
                logger.warning("AI Quota Hit for slide %s. Pivoting to visual-only mode.", slide_id)
                return cls.FALLBACK_MSG
            
            logger.error("Critical AI failure for slide %s: %s", slide_id, e)
            return ""

    # Concurrency governor — controls max parallel AI calls across the pipeline
    _semaphore: Optional[asyncio.Semaphore] = None
    _semaphore_loop: Optional[asyncio.AbstractEventLoop] = None
    MAX_CONCURRENT_AI_CALLS = 8
    MAX_RETRIES = 3
    BASE_BACKOFF_S = 1.0

    @classmethod
    def get_semaphore(cls) -> asyncio.Semaphore:
        """Lazy-init semaphore (must be created inside a running event loop).

        Recreates the semaphore if the running loop has changed since it was
        cached — a bare class-level singleton stays bound to whichever loop
        first created it, so reusing it under a new loop (e.g. each test
        getting its own event loop) raises "Future attached to a different
        loop" the moment two coroutines contend for it.
        """
        current_loop = asyncio.get_event_loop()
        if cls._semaphore is None or cls._semaphore_loop is not current_loop:
            cls._semaphore = asyncio.Semaphore(cls.MAX_CONCURRENT_AI_CALLS)
            cls._semaphore_loop = current_loop
        return cls._semaphore

    @classmethod
    async def wrap_call_async(cls, slide_id: str, func, *args, survey_id: str = "", dedup_key: str = "", **kwargs) -> Any:
        """
        Executes an AI call with:
        1. Semaphore-based concurrency control (max 8 parallel)
        2. Exponential backoff + jitter on 429/rate-limit errors (up to 3 retries)
        3. Graceful fallback with admin alerting on permanent failure
        """
        import inspect
        import random

        sem = cls.get_semaphore()
        max_retries = kwargs.pop("max_retries", cls.MAX_RETRIES)

        async def _do_guarded_call():
            for attempt in range(max_retries + 1):
                try:
                    async with sem:
                        # Check the CALL RESULT for awaitability rather than
                        # pre-judging `func` via inspect.iscoroutinefunction —
                        # that check misses AsyncMock and other non-`async def`
                        # awaitable-returning callables, which silently handed
                        # back an unawaited coroutine instead of its result.
                        call_result = func(*args, **kwargs)
                        if inspect.isawaitable(call_result):
                            return await call_result
                        return call_result
                except Exception as e:
                    if cls.is_quota_error(e) and attempt < max_retries:
                        # Exponential backoff: 1s, 2s, 4s + jitter
                        delay = cls.BASE_BACKOFF_S * (2 ** attempt) + random.uniform(0, 0.5)
                        logger.warning(
                            "[AIGuard] Rate limit hit for %s (attempt %d/%d). Retrying in %.1fs...",
                            slide_id, attempt + 1, cls.MAX_RETRIES, delay
                        )
                        await asyncio.sleep(delay)
                        continue

                    if cls.is_quota_error(e):
                        logger.warning("[AIGuard] AI Quota Exhausted for survey %s (Slide: %s) after %d retries.",
                                       survey_id, slide_id, cls.MAX_RETRIES)
                        if cls.quota_monitor:
                            try:
                                from backend.analytics_module.src.ai import api_cost
                                await cls.quota_monitor.on_quota_exhausted(
                                    survey_id, e, api_cost.get_summary()
                                )
                            except Exception as am_e:
                                logger.error("[AIGuard] Failed to trigger QuotaMonitor alert: %s", am_e)
                        return cls.FALLBACK_MSG

                    logger.error("[AIGuard] Critical AI failure for slide %s: %s", slide_id, e)
                    raise
        
        # Wrap everything with Coalescer
        if dedup_key:
            prev_saved = coalescer.saved_calls
            result = await coalescer.execute_or_wait(dedup_key, _do_guarded_call)
            if coalescer.saved_calls > prev_saved:
                from . import api_cost
                api_cost.record_dedup_save()
            return result
        
        return await _do_guarded_call()


async def generate_insight(
    slide_id: str,
    slide_data: Any,
    client: Any,
    model: str,
    section: str = "",
    my_brand: str = "",
    previous_context: Optional[str] = None,
    research_type: str = "Standard",
    archetype: Optional[str] = None,
    trace_log_path: Optional[Union[str, Path]] = None,
    cache_manager: Optional[Any] = None,
    survey_id: str = ""
) -> str:
    if client is None or not model:
        return ""
    
    async def _do_generate():
        # 1. Determine focal instructions (Brand-specific logic)
        prompts = registry.get_template("insights")
        sec_norm = section.strip().lower()
        brand_nm = (my_brand or "").strip()
        user_extra = ""
        
        if previous_context:
            user_extra += f"PREVIOUS SLIDE CONTEXT:\n{previous_context}\n\n"
            
        if sec_norm in {s.lower() for s in BRAND_FOCUS_SECTIONS} and brand_nm:
            if _my_brand_in_data(slide_data, brand_nm):
                user_extra += prompts.get("brand_focus", "").format(section=section.strip(), brand_name=brand_nm)
            else:
                user_extra += prompts.get("competitor_focus", "").format(section=section.strip(), brand_name=brand_nm)

        # 2. ORCHESTRATED CONSTRUCTION
        messages = PromptOrchestrator.construct_messages(
            template_key="insights",
            data=slide_data,
            model=model,
            research_type=research_type,
            archetype=archetype,
            variables={"slide_id": slide_id},
            user_extra=user_extra,
            output_budget=0
        )
        
        # 3. GENERATION WITH DEDUP SIGNATURE
        # The dedup_key is based on the final orchestrated messages
        from .dedup import coalescer
        dedup_key = coalescer.generate_key(messages, model, get_response_format("chart_insights"))

        async def _call_api():
            from .schemas import get_response_format
            response = await stream_json_completion(
                client=client,
                model=model,
                messages=messages,
                response_format=get_response_format("chart_insights"),
                max_tokens=600,
                temperature=0,
            )
            api_cost.add_from_openai_response(
                "slide_insights", model, response, 
                duration_ms=response.duration_ms, 
                ttft_ms=response.ttft_ms
            )
            return response.choices[0].message.content

        # APPLICATION-SIDE CACHE WRAPPER (Task 2.6)
        if cache_manager and survey_id:
            return await cache_manager.get_or_execute(
                survey_id=survey_id,
                component_type="slide_insight",
                component_key=slide_id,
                prompt_version=registry.get_template_version("slide_insights"),
                messages=messages,
                executor_coro=lambda: AIGuard.wrap_call_async(
                    slide_id=f"slide_{slide_id}", 
                    func=_call_api, 
                    dedup_key=dedup_key,
                    survey_id=survey_id
                )
            )

        return await AIGuard.wrap_call_async(
            slide_id=f"slide_{slide_id}", 
            func=_call_api, 
            dedup_key=dedup_key,
            survey_id=survey_id
        )

async def generate_recommendations(
    insights_list: list[Dict[str, Any]],
    client: Any,
    model: str,
    include_slide_data: bool = False,
    trace_log_path: Optional[Union[str, Path]] = None,
    survey_context: Optional[Any] = None,
) -> Dict[str, list[str]]:
    if not client or not model or not insights_list:
        return {k: [] for k in FOUR_P_KEYS}

    insight_blocks = []
    for item in insights_list:
        insight = (item.get("insight") or "").strip()
        if not insight: continue
        block = f"[Section: {item.get('section', '')} | Slide ID: {item.get('slide_id', '')} | Title: {item.get('title', '')}]\n{insight}"
        if include_slide_data and item.get("data") is not None:
            data_summary = _data_to_summary(item["data"])
            if data_summary and data_summary != "(No data)":
                block += f"\nSupporting data metrics:\n{data_summary}"
        insight_slide_id = item.get('slide_id', '')
        block += f"\n(CITE-REF: [Slide {insight_slide_id}])"
        insight_blocks.append(block)

    if not insight_blocks:
        return {k: [] for k in FOUR_P_KEYS}

    prompts = _get_prompts()["recommendations"]
    prompt_vars: Dict[str, Any] = {"insights_text": "\n\n".join(insight_blocks)}
    if survey_context is not None:
        prompt_vars.update(survey_context.to_prompt_variables())
    else:
        prompt_vars.update({
            "target_brand": "Not specified",
            "category": "Not specified",
            "market": "Not specified",
            "survey_objective": "Not specified",
            "testing_protocol": "unspecified",
        })
    user_content = registry.format_prompt("recommendations", prompt_vars)
    if include_slide_data:
        user_content += prompts.get("user_extra", "")

    rec_messages = [
        {"role": "system", "content": registry.get_god_prompt()},
        {"role": "user", "content": user_content},
    ]
    if trace_log_path:
        attach_recommendation_trace_handler(trace_log_path)
    trace_recommendation_prompt(model=model, messages=rec_messages)
    async def _do_generate():
        response = await stream_json_completion(
            client=client,
            model=model,
            messages=rec_messages,
            max_tokens=800
        )
        _record_usage(
            "recommendations", model, response, 
            duration_ms=response.duration_ms, 
            ttft_ms=response.ttft_ms
        )
        text = (response.choices[0].message.content or "").strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:-1])
        data = json.loads(text)
        return {k: [str(x).strip() for x in data.get(k, []) if str(x).strip()] for k in FOUR_P_KEYS}

    try:
        # Wrap with AIGuard to handle 429 quota errors gracefully
        result = AIGuard.wrap_call("global_recommendations", _do_generate)
        
        # If AIGuard returned the fallback string instead of a dict, provide structured fallback
        if isinstance(result, str):
             fallback_advice = ["AI synthesis skipped — evaluate the visual charts for strategic direction."]
             return {k: fallback_advice for k in FOUR_P_KEYS}
        return result
    except Exception as e:
        logger.error("Final fallback in generate_recommendations: %s", e)
        return {k: ["Manual review of charts recommended."] for k in FOUR_P_KEYS}
