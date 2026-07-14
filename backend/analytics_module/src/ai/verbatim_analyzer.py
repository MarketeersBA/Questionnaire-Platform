import json
import logging
import asyncio
import time
import pandas as pd
from typing import Any, Dict, List, Optional
from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai.__init__ import AIGuard
from backend.analytics_module.src.ai.prompt_registry import registry, ANALYTICS_PROMPT_SUITE_VERSION
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
from backend.analytics_module.src.ai.utils import stream_json_completion
from backend.analytics_module.src.ai.schemas import get_response_format

logger = logging.getLogger(__name__)

class VerbatimAnalyzer:
    def __init__(
        self,
        client: Any,
        model: str,
        cache_manager: Optional[InsightCacheManager] = None,
        survey_id: str = "",
        survey_context: Optional[Any] = None,
    ):
        self.client = client
        self.model = model
        self.cache = cache_manager
        self.survey_id = survey_id
        self.survey_context = survey_context

    async def _call_openai_json(self, user_msg: str, component_key: str = "verbatim", brand_name: str = "") -> Dict[str, Any]:
        """Low-level OpenAI JSON executor with cost tracking and strict schema."""
        prompt_data = registry.get_template("verbatim_analysis")
        res = await stream_json_completion(
            client=self.client,
            model=self.model,
            messages=[
                {"role": "system", "content": registry.get_god_prompt()},
                {"role": "user", "content": user_msg}
            ],
            response_format=get_response_format("verbatim_brand"),
            max_tokens=1000
        )
        api_cost.add_from_openai_response(
            f"verbatim_{brand_name[:10]}", self.model, res, 
            duration_ms=res.duration_ms, 
            ttft_ms=res.ttft_ms
        )
        # Strict mode guarantees schema compliance — direct parse is safe
        return json.loads(res.choices[0].message.content or "{}")

    async def analyze_responses_async(self, question_title: str, brand_name: str, responses: List[str], component_key: str) -> Dict[str, Any]:
        """Analyzes a list of strings for a single brand/question pair (Asynchronous & Cached)."""
        if not self.client or not self.model:
            return {}

        valid_responses = [str(r).strip() for r in responses if pd.notna(r) and str(r).strip()]
        if not valid_responses:
            return {}

        # 1. Check Cache First
        prompt_data = registry.get_template("verbatim_analysis")
        version = registry.get_template_version("verbatim_analysis")
        prefix_v = PromptOrchestrator.get_prefix_version()
        
        if self.cache and self.survey_id:
            cached = await self.cache.get_cached(
                self.survey_id, "verbatim_brand_scoped", component_key, version,
                prefix_version=prefix_v
            )
            if cached:
                return cached

        # 2. Adaptive Statistical Sampling (Dynamic Scale)
        base_n = len(valid_responses)
        # Formula: min(max(50, base_n // 5), 200)
        # Floor: 50 (or total if < 50), Ceiling: 200 (for LLM context safety)
        sample_size = min(max(50, base_n // 5), 200) if base_n >= 50 else base_n
        
        if base_n > sample_size:
            logger.info(f"[VerbatimAnalyzer] Dynamic sampling: taking {sample_size} from total {base_n} responses.")
            import random
            random.seed(42)  # Deterministic sampling for consistency
            valid_responses = random.sample(valid_responses, sample_size)
        else:
            sample_size = base_n

        responses_text = "\n".join([f"- {r}" for r in valid_responses])
        target_brand = (
            self.survey_context.target_brand if self.survey_context else brand_name
        ) or brand_name
        testing_protocol = (
            self.survey_context.testing_protocol if self.survey_context else "unspecified"
        )

        async def _do_work():
            messages = PromptOrchestrator.construct_messages(
                template_key="verbatim_analysis",
                data=valid_responses,
                model=self.model,
                research_type="taste_test",
                variables={
                    "question_text": question_title,
                    "question_type": question_title,
                    "total_responses": sample_size,
                    "base_n": base_n,
                    "responses_summary": responses_text,
                    "brand_name": brand_name,
                    "target_brand": target_brand,
                    "testing_protocol": testing_protocol,
                },
                output_budget=0,
                survey_meta=self.survey_context,
                user_template_field="user_base_brand_scoped",
            )
            
            # 3. DEDUP & EXECUTION (Task 2.7 Mapping)
            from .dedup import coalescer
            dedup_key = coalescer.generate_key(messages, self.model, get_response_format("verbatim_brand"))

            async def _call_api():
                res = await stream_json_completion(
                    client=self.client,
                    model=self.model,
                    messages=messages,
                    response_format=get_response_format("verbatim_brand"),
                    max_tokens=600
                )
                api_cost.add_from_openai_response(
                    f"verbatim_{brand_name[:5]}", self.model, res, 
                    duration_ms=res.duration_ms, 
                    ttft_ms=res.ttft_ms,
                    prefix_version=prefix_v
                )
                
                raw = json.loads(res.choices[0].message.content or "{}")
                # MAP UNIFIED -> VERBATIM Brand
                return {
                    "key_takeaway": raw.get("headline", ""),
                    "themes": [
                        {
                            "title": i.get("title", ""),
                            "description": i.get("body", ""),
                            "percentage": i.get("percentage", 0),
                            "quote": i.get("quote", "")
                        } for i in raw.get("insights", [])
                    ],
                    "sentiment": raw.get("meta", {}).get("sentiment", {"positive": 33, "negative": 33, "neutral": 34})
                }

            result = await AIGuard.wrap_call_async(component_key, _call_api, dedup_key=dedup_key, survey_id=self.survey_id)
            
            # Persist to Cache
            if self.cache and self.survey_id:
                await self.cache.set_cache(
                    survey_id=self.survey_id,
                    component_type="verbatim_brand_scoped",
                    component_key=component_key,
                    prompt_version=version,
                    prefix_version=prefix_v,
                    prompt_text=json.dumps(messages),
                    headline=result.get("key_takeaway", ""),
                    analysis=result.get("themes", []),
                    raw_response=json.dumps(result),
                    model=self.model,
                    token_metrics={},
                    cost_usd=0
                )
            
            return result

        try:
            val = await AIGuard.wrap_call_async(component_key, _do_work, survey_id=self.survey_id)
            return val if isinstance(val, dict) else {}
        except Exception as e:
            logger.error(f"[VerbatimAnalyzer] Failed brand-scoped analysis for {brand_name}: {e}")
            return {}

    def _get_suffix_for_brand(self, brand: str, project_inputs: dict) -> Optional[str]:
        """Maps a brand label to its dataset suffix digit (1, 2, ...) using standard resolution logic."""
        b = str(brand).strip()
        
        # 1. Check suffix_map
        sm = project_inputs.get("suffix_map") or {}
        for k, v in sm.items():
            if str(v).strip() == b:
                return str(k)
        
        # 2. Check comparators_map
        cm = project_inputs.get("comparators_map") or {}
        if isinstance(cm, dict):
            for k, v in cm.items():
                if str(v).strip() == b:
                    return str(k)
        
        # 3. Fallback: Index in brands list (1-indexed)
        brands = project_inputs.get("brands") or []
        if b in brands:
            return str(brands.index(b) + 1)
            
        return None

    def _collect_brand_scoped_responses(self, df_responses: pd.DataFrame, project_inputs: dict, column_key: str) -> Dict[str, List[str]]:
        """
        Groups responses by their resolved brand identity.
        Returns: { "Abu Auf": ["Response A", "Response B"], ... }
        """
        brands = project_inputs.get("brands", [])
        brand_responses = {}
        
        base_col = project_inputs.get(column_key)
        if not base_col:
            return {}

        for brand in brands:
            suffix = self._get_suffix_for_brand(brand, project_inputs)
            if not suffix:
                continue
                
            col_name = f"{base_col}{suffix}"
            if col_name in df_responses.columns:
                valid = df_responses[col_name].dropna().astype(str).tolist()
                valid = [r.strip() for r in valid if r.strip() and r.lower() not in ["none", "na", "n/a", "."]]
                if valid:
                    brand_responses[brand] = valid
        
        return brand_responses

    async def run_all(self, df_responses: pd.DataFrame, project_inputs: dict, brands: List[str]) -> Dict[str, Any]:
        """
        NEW BRAND-SCOPED PIPELINE (v2):
        1. Resolve exact columns for each brand/theme pair.
        2. Perform high-precision parallel AI analysis.
        """
        if df_responses is None or df_responses.empty or not brands:
            return {}

        oe_keys = {
            "like_in_taste": "Likes",
            "dislike_in_taste": "Dislikes",
            "improvement_in_taste": "Improvements",
            "favorite_in_taste": "Favorites"
        }
        
        final_results = {}

        for key, display_name in oe_keys.items():
            # Step 1: Use Resolution Engine to gather responses
            brand_responses = self._collect_brand_scoped_responses(df_responses, project_inputs, key)
            if not brand_responses:
                continue
            
            brand_level_analyses = {}
            tasks = []
            brand_map = []

            # Step 2: Prepare Parallel Tasks
            for brand_name, resps in brand_responses.items():
                component_key = f"{key}_{brand_name.lower().replace(' ', '_')}"
                tasks.append(self.analyze_responses_async(display_name, brand_name, resps, component_key))
                brand_map.append(brand_name)

            if not tasks:
                continue

            from .batch_grouper import BatchGrouper
            
            # TASK 3.4: BATCH GROUPING
            indexed_tasks = list(enumerate(tasks))
            task_groups = [indexed_tasks[i:i + 4] for i in range(0, len(indexed_tasks), 4)]

            results = [None] * len(tasks)
            async def _execute_task(indexed_task):
                idx, coro = indexed_task
                results[idx] = await coro

            await BatchGrouper.execute_in_waves(
                groups=task_groups,
                execution_fn=_execute_task,
                wave_label=f"Verbatim_{display_name}"
            )
            
            # Map results back to brands
            for i, brand_name in enumerate(brand_map):
                if i < len(results) and results[i]:
                    brand_level_analyses[brand_name] = results[i]

            if brand_level_analyses:
                # Step 4: Cross-brand Synthesis
                synthesis = await self._synthesize_cross_brand(display_name, brand_level_analyses)
                final_results[display_name] = {
                    "brands": brand_level_analyses,
                    "synthesis": synthesis
                }

        return final_results

    async def _synthesize_cross_brand(self, question_type: str, brand_analyses: Dict[str, Dict]) -> str:
        """Produces a short comparative headline across brands for a theme."""
        if len(brand_analyses) <= 1:
            return ""

        summary_bits = []
        for brand, analysis in brand_analyses.items():
            takeaway = analysis.get("key_takeaway", "Positive overall feedback.")
            summary_bits.append(f"{brand}: {takeaway}")

        async def _do_synthesize():
            # ORCHESTRATED CONSTRUCTION
            messages = PromptOrchestrator.construct_messages(
                template_key="verbatim_synthesis",
                data=summary_bits,
                model=self.model,
                variables={"question": question_type},
                output_budget=0
            )

            # 3. DEDUP & EXECUTION (Task 2.7 Mapping)
            from .dedup import coalescer
            dedup_key = coalescer.generate_key(messages, self.model, get_response_format("executive_summary"))

            async def _call_api():
                res = await stream_json_completion(
                    client=self.client,
                    model=self.model,
                    messages=messages,
                    response_format=get_response_format("executive_summary"),
                    max_tokens=600
                )
                api_cost.add_from_openai_response(
                    "verbatim_synthesis", self.model, res, 
                    duration_ms=res.duration_ms, 
                    ttft_ms=res.ttft_ms,
                    prefix_version=PromptOrchestrator.get_prefix_version()
                )
                
                raw = json.loads(res.choices[0].message.content or "{}")
                # MAP UNIFIED -> Comparative Headline
                return raw.get("headline", "Summary unavailable.")

            return await AIGuard.wrap_call_async(f"vsyn_{question_type}", _call_api, dedup_key=dedup_key, survey_id=self.survey_id)

        try:
            return await AIGuard.wrap_call_async(f"verbatim_synthesis_{question_type}", _do_synthesize, survey_id=self.survey_id)
        except Exception:
            return ""
