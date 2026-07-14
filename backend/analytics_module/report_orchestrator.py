"""
ReportOrchestrator — Phase 3 hardened (Batch & Data-Native).

State machine:  pending → generating → awaiting_batch → ready | failed
"""
from __future__ import annotations

import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from backend.models import SurveyReport, ReportSection, ReportInsights, ReportDataContext, SurveyContextBlock
from backend.analytics_module.main import SurveyAnalyzer
from backend.analytics_module.web_serializer import WebReportSerializer
from backend.analytics_module.insight_aggregator import InsightAggregator
from backend.analytics_module.src.ai.model_router import ModelRouter
from backend.analytics_module.ingestor import DirectIngestor
from backend.analytics_module.aggregator import ReportAggregator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Constants
# ---------------------------------------------------------------------------
GENERATION_TIMEOUT_S = 300  # 5 minutes max for the entire pipeline
MAX_RETRY_COUNT = 999999 if os.getenv("ANALYTICS_DEVELOPER_MODE", "false").lower() == "true" else 3

_AI_QUOTA_FALLBACK_USER = (
    "✨ Your analytical charts are fully computed and ready for review. "
    "AI-powered narrative synthesis is temporarily paused to optimize system resources. "
    "Your data speaks for itself — explore the visualizations below."
)


class TargetNotReachedException(Exception):
    """Raised when trying to generate a report before the survey target is met."""
    pass


class ReportOrchestrator:
    """
    Top-level coordinator:
    1. Validates response target
    2. Delegates to SurveyAnalyzer
    3. Serializes slides → JSON
    4. Handles Real-time vs Batch AI insights
    5. Persists to MongoDB
    """

    def __init__(self, db: AsyncIOMotorDatabase, app_config: Any):
        self.db = db
        self.app_config = app_config

    async def _load_survey_document(self, survey_id: str) -> dict:
        """Load raw survey config; returns {} when the id is missing or not a valid ObjectId."""
        try:
            oid = ObjectId(survey_id)
        except Exception:
            logger.warning("ReportOrchestrator: invalid survey ObjectId '%s'", survey_id)
            return {}
        doc = await self.db.surveys.find_one({"_id": oid})
        return doc or {}

    async def get_or_generate(
        self,
        survey_id: str,
        project_inputs: dict,
        df_responses: Any,
        df_metrics: Any,
        meta_data: Any,
        meta_grids: Any,
        codebook_df: Any,
        force: bool = False,
        batch_mode: bool = False
    ) -> SurveyReport:
        """Gets an existing report or generates a new one."""

        # 0. Live Target Gate
        target = project_inputs.get("respondent_target", 0)
        if target > 0:
            actual = await self._get_live_submitted_count(survey_id)
            if actual < target:
                raise TargetNotReachedException(
                    f"Collection incomplete. Target is {target}, but only {actual} responses collected."
                )
            project_inputs["respondent_count"] = actual

        existing = await self.db.survey_reports.find_one({"survey_id": survey_id})

        if existing and existing.get("status") == "ready" and not force:
            return SurveyReport(**existing)

        if existing and existing.get("status") in ["generating", "awaiting_batch"] and not force:
            return SurveyReport(**existing)

        retry_count = (existing or {}).get("retry_count", 0)
        if retry_count >= MAX_RETRY_COUNT and not force and not os.getenv("ANALYTICS_DEVELOPER_MODE"):
            logger.error("Survey %s has exceeded max retries.", survey_id)
            return SurveyReport(**existing)

        # Initialize report to "generating"
        now = datetime.now(timezone.utc)
        report_data = {
            "survey_id": survey_id,
            "status": "generating",
            "project_name": project_inputs.get("project_name", "Untitled"),
            "research_type": project_inputs.get("research_type", ""),
            "total_responses": len(df_responses) if df_responses is not None else 0,
            "generated_at": now,
            "retry_count": retry_count + 1,
        }

        router = ModelRouter(base_model=self.app_config.model)
        report_data["telemetry"] = {"model_routing": router.get_routing_summary()}

        await self.db.survey_reports.update_one(
            {"survey_id": survey_id},
            {"$set": report_data, "$setOnInsert": {"version": 1}},
            upsert=True,
        )

        try:
            survey_doc = await self._load_survey_document(survey_id)
            my_brand = (
                project_inputs.get("own_brand")
                or project_inputs.get("my_brand")
                or ""
            )
            base_n = project_inputs.get("respondent_count")
            if base_n is None and df_responses is not None:
                base_n = len(df_responses)
            base_n = int(base_n or 0)

            survey_context = SurveyContextBlock.from_survey_doc(
                survey_doc,
                my_brand=my_brand,
                base_n=base_n,
                brands=project_inputs.get("brands"),
            )
            project_inputs["survey_context"] = survey_context

            # 1. Run core pipeline
            analyzer = SurveyAnalyzer(project_inputs, self.app_config)
            result = analyzer.run(df_responses, df_metrics, meta_data, meta_grids, codebook_df)
            
            # 2. Serialize to Web format
            slide_entries = result.get("slide_entries", [])
            raw_payloads = result.get("raw_payloads", {})
            narrator_history = result.get("narrator_history", [])

            from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
            cache_mgr = InsightCacheManager(self.db)

            # --- Sections & Chart Insights ---
            batch_items = []
            sections = await self._build_sections(
                slide_entries, raw_payloads, project_inputs, cache_mgr,
                survey_id, router, batch_items if batch_mode else None,
                survey_context=survey_context,
            )

            # 3. Handle Verbatim (Real-time for now, or could be batched later)
            v_takeaways = {}
            has_key = hasattr(self.app_config, "openai_api_key") and self.app_config.openai_api_key
            if has_key and df_responses is not None:
                try:
                    from backend.analytics_module.src.ai.verbatim_analyzer import VerbatimAnalyzer
                    v_analyzer = VerbatimAnalyzer(
                        self.app_config.client, router.resolve("verbatim"),
                        cache_manager=cache_mgr, survey_id=survey_id,
                        survey_context=survey_context,
                    )
                    v_results = await v_analyzer.run_all(df_responses, project_inputs, brands=project_inputs.get("brands", []))
                    if v_results:
                        v_takeaways = {theme: data.get("key_takeaway", "") for theme, data in v_results.items()}
                        # Inject verbatim into sections... (logic simplified for brevity)
                        v_section = ReportSection(section_id="verbatim", section_name="Verbatim Analysis", order=len(sections))
                        new_charts = WebReportSerializer._serialize_verbatim_analysis(None, v_results)
                        v_section.charts.extend(new_charts)
                        sections.append(v_section)
                except Exception as e:
                    logger.error("Verbatim analysis failed: %s", e)

            # 4. Hero Metrics Extraction
            hero_map = {"brand_awareness": "Brand Awareness", "purchase_funnel_aided": "Aided Funnel"}
            hero_metrics = {}
            for s in sections:
                for c in s.charts:
                    if c.get("chart_id") in hero_map:
                        hero_metrics[hero_map[c.get("chart_id")]] = c.get("data")

            report_context = ReportDataContext(
                narrator_history=narrator_history,
                hero_metrics=hero_metrics,
                verbatim_takeaways=v_takeaways,
                metadata={
                    "research_type": project_inputs.get("research_type", ""),
                    "brands": project_inputs.get("brands", []),
                    "survey_id": survey_id,
                    "my_brand": my_brand,
                    "survey_context": survey_context.model_dump(),
                },
            )

            # 5. Batch Finalization vs Real-time
            if batch_mode and batch_items:
                batch_id = await self._submit_to_openai_batch(batch_items)
                await self.db.survey_reports.update_one(
                    {"survey_id": survey_id},
                    {
                        "$set": {
                            "status": "awaiting_batch",
                            "ai_batch_id": batch_id,
                            "sections": [s.model_dump() for s in sections],
                            "partial_context": report_context.model_dump()
                        }
                    }
                )
                logger.info("Report %s submitted to OpenAI Batch: %s", survey_id, batch_id)
                final_doc = await self.db.survey_reports.find_one({"survey_id": survey_id})
                return SurveyReport(**final_doc)

            # Real-time synthesis (Integrated with Opportunity Engine)
            insights, status = await self._safe_aggregate_insights(
                report_context,
                project_inputs,
                router,
                df_responses=df_responses,
                survey_context=survey_context,
            )
            
            # 6. Final Serialization & Strategic Injection [Task 3.2]
            if insights.market_position_report:
                try:
                    strat_section = ReportSection(
                        section_id="strategic_positioning",
                        section_name="Strategic Position Intelligence",
                        order=-1 # Place at the very top (Executive focus)
                    )
                    
                    survey_data = DirectIngestor.load_sync(df_responses.to_dict('records'), survey_id)
                    agg = ReportAggregator(survey_data, project_inputs.get("own_brand"))
                    
                    for key in ["market_position_sigma", "audience_affinity", "positioning_matrix"]:
                        raw_data = getattr(agg, key)() if key != "audience_affinity" else agg.audience_affinity_index()
                        if raw_data:
                            strategic_charts_payloads = WebReportSerializer.serialize_strategic_insight(key, raw_data)
                            strat_section.charts.extend(strategic_charts_payloads)
                    
                    sections.insert(0, strat_section)
                    logger.info("Injected Strategic Position Intelligence section into report.")
                except Exception as strat_e:
                    logger.error("Failed to inject strategic charts: %s", strat_e)

            # Flatten charts for the V2 frontend pipeline
            all_charts_flat = []
            for s in sections:
                for c in s.charts:
                    all_charts_flat.append(c if isinstance(c, dict) else c.model_dump())

            ready_data = {
                "status": "ready",
                "sections": [s.model_dump() for s in sections],
                "charts": all_charts_flat,
                "insights": insights.model_dump(),
                "telemetry": {**result.get("telemetry", {}), "ai_status": status},
            }
            await self.db.survey_reports.update_one({"survey_id": survey_id}, {"$set": ready_data})
            
            # ── [Task 2] Post-Processing Hook ──
            # Run artifact generation (PPTX) and other side-effects in background
            try:
                from backend.analytics_module.post_processor import ReportPostProcessor
                processor = ReportPostProcessor(self.db, survey_id)
                # We can run this as a sub-task or await it depending on criticality
                # In orchestration context, we await it to ensure DB is consistent before returning
                await processor.run(ready_data)
            except Exception as pp_err:
                logger.error("Post-processing orchestration failed: %s", pp_err)

            final_doc = await self.db.survey_reports.find_one({"survey_id": survey_id})
            return SurveyReport(**final_doc)

        except Exception as e:
            logger.exception("Report generation failed")
            await self.db.survey_reports.update_one(
                {"survey_id": survey_id},
                {"$set": {"status": "failed", "error_message": str(e)}},
            )
            final_doc = await self.db.survey_reports.find_one({"survey_id": survey_id})
            return SurveyReport(**final_doc) if final_doc else None

    async def _submit_to_openai_batch(self, items: List[Dict]) -> str:
        """Uploads JSONL and creates an OpenAI batch."""
        import io
        jsonl_content = "\n".join([json.dumps(i) for i in items])
        file_obj = self.app_config.client.files.create(
            file=io.BytesIO(jsonl_content.encode()),
            purpose="batch"
        )
        batch = self.app_config.client.batches.create(
            input_file_id=file_obj.id,
            endpoint="/v1/chat/completions",
            completion_window="24h"
        )
        return batch.id

    async def _safe_aggregate_insights(
        self,
        context: ReportDataContext,
        project_inputs: dict,
        router: ModelRouter,
        df_responses: Any = None,
        survey_context: Optional[SurveyContextBlock] = None,
    ) -> tuple:
        try:
            aggregator = InsightAggregator(
                self.app_config.openai_api_key,
                model=router.resolve("executive_summary"),
                client=self.app_config.client,
            )
            insights = await aggregator.aggregate(
                context,
                research_type=project_inputs.get("research_type", "Standard"),
                survey_context=survey_context,
            )
            
            # --- PHASE 6: OPPORTUNITY ENGINE INTEGRATION ---
            # Identifies brand weaknesses using deterministic gap analysis + verbatim proof
            my_brand = project_inputs.get("own_brand")
            if my_brand and df_responses is not None:
                try:
                    from backend.analytics_module.src.ai.opportunity_detector import OpportunityDetector
                    from backend.analytics_module.src.ai.opportunity_nlp import OpportunityNLPAnalyzer
                    from backend.analytics_module.src.ai.opportunity_synthesizer import OpportunitySynthesizer
                    from backend.analytics_module.aggregator import ReportAggregator
                    
                    # 1. Prepare Survey Data Container
                    survey_data = DirectIngestor.load_sync(df_responses.to_dict('records'), str(project_inputs.get("survey_id", "")))
                    survey_data.own_brand = my_brand
                    survey_data.category = project_inputs.get("category", "")
                    
                    # 2. Phase 1-3: Deterministic Detection
                    agg = ReportAggregator(survey_data, my_brand)
                    raw_signals = agg.opportunity_signals()
                    
                    # Target brand from survey_data is already set
                    detector = OpportunityDetector(survey_data, project_inputs)
                    top_opportunities = detector.detect(raw_signals)
                    
                    # 3. Phase 4: NLP Alignment
                    nlp = OpportunityNLPAnalyzer()
                    global_feedback = nlp.extract_feedback(df_responses, my_brand, project_inputs)
                    alignment_map = nlp.map_feedback_to_attributes(global_feedback, [o["attribute"] for o in top_opportunities])
                    packages = nlp.build_packages(top_opportunities, alignment_map, global_feedback)
                    
                    # 4. Phase 5: LLM Synthesis (Formatting Only)
                    synthesizer = OpportunitySynthesizer(
                        self.app_config.client, router.resolve("opportunity_summary"), 
                        cache_manager=context.metadata.get("cache_mgr"), survey_id=survey_data.survey_id
                    )
                    
                    insights.opportunity_insights = await synthesizer.synthesize(
                        packages, brand_name=my_brand, 
                        category=survey_data.category, 
                        sample_n=survey_data.response_count,
                        testing_protocol=(
                            survey_context.testing_protocol if survey_context else "unspecified"
                        ),
                    )
                    logger.info(f"Generated {len(insights.opportunity_insights)} Opportunity Insights for {my_brand}")

                    # --- PHASE 2: MARKET POSITION INTELLIGENCE ---
                    # [Task 3.1] Strategic Positioning Synthesis
                    try:
                        from backend.analytics_module.src.ai.market_position_synthesizer import MarketPositionSynthesizer
                        
                        # 1. Run Quantitative Engines (Already have 'agg' from above)
                        mp_sigma = agg.market_position_sigma()
                        aa_index = agg.audience_affinity_index()
                        cp_matrix = agg.competitive_position_matrix()
                        
                        # 2. Strategic Synthesis
                        mp_synthesizer = MarketPositionSynthesizer(
                            self.app_config.client, router.resolve("market_position"),
                            cache_manager=context.metadata.get("cache_mgr"), 
                            survey_id=survey_data.survey_id
                        )
                        
                        insights.market_position_report = await mp_synthesizer.synthesize(
                            brand_name=my_brand,
                            category=survey_data.category,
                            research_type=project_inputs.get("research_type", "Standard"),
                            sigma_results=mp_sigma,
                            affinity_results=aa_index,
                            matrix_results=cp_matrix
                        )
                        logger.info(f"Synthesized Market Position Report for {my_brand}")
                    except Exception as mp_e:
                        logger.error("Market Position Synthesis failed: %s", mp_e)

                except Exception as opp_e:
                    logger.error("Opportunity Engine / Market Position failed: %s", opp_e, exc_info=True)

            return insights, "success"
        except Exception as e:
            logger.error("Synthesis failed: %s", e)
            return ReportInsights(executive_summary=_AI_QUOTA_FALLBACK_USER), "fallback"

    async def _build_sections(
        self, slide_entries, raw_payloads, project_inputs, cache_mgr,
        survey_id, router, batch_items: Optional[List] = None,
        survey_context: Optional[SurveyContextBlock] = None,
    ) -> List[ReportSection]:
        """
        Two-phase section builder:
          Phase 1 (Sync): Serialize all slides into ChartPayloads — no I/O.
          Phase 2 (Async): Fire all AI insight calls concurrently via gather().

        The AIGuard semaphore limits to 8 concurrent OpenAI calls,
        and exponential backoff handles 429s automatically.
        """
        from backend.analytics_module.chart_insight_engine import ChartInsightEngine
        from backend.analytics_module.src.MySlides.registry import get_registry
        from backend.analytics_module.src.ai.batch_grouper import BatchGrouper

        sections_map: Dict[str, ReportSection] = {}
        my_brand = project_inputs.get("own_brand", "")
        has_key = hasattr(self.app_config, "openai_api_key") and self.app_config.openai_api_key

        chart_engine = None
        if has_key:
            chart_engine = ChartInsightEngine(
                self.app_config.client, router.resolve("chart_insights"), my_brand,
                research_type=project_inputs.get("research_type", "Standard"),
                archetype=project_inputs.get("archetype", "General Analyst"),
                cache_manager=cache_mgr, survey_id=survey_id,
                survey_context=survey_context,
            )

        # ------------------------------------------------------------------
        # PHASE 1: Synchronous Serialization (CPU-bound, fast)
        # Collect all charts without making any AI calls.
        # ------------------------------------------------------------------
        pending_ai_tasks: List[Dict[str, Any]] = []  # [{chart, section_name, index}]

        for entry in slide_entries:
            sec_name = entry.get("section", "General")
            if sec_name not in sections_map:
                sections_map[sec_name] = ReportSection(
                    section_id=sec_name.lower().replace(" ", "_"),
                    section_name=sec_name,
                    order=len(sections_map),
                )

            section = sections_map[sec_name]
            raw_data = raw_payloads.get(entry.get("slide_id"))
            if not raw_data:
                continue

            name = entry.get("dynamic_class_name") or entry.get("dynamic_key")
            cls = self._resolve_class(name)
            if not cls:
                continue

            try:
                concept_instance = cls()
                if hasattr(concept_instance, "template_slide_title"):
                    concept_instance.template_slide_title = entry.get("template_slide_title", "")

                charts = WebReportSerializer.serialize_slide(concept_instance, raw_data)
                for chart in charts:
                    chart.insight = entry.get("insight", "")
                    idx = len(section.charts)
                    section.charts.append(chart)

                    if batch_items is not None and chart_engine:
                        # Batch mode: collect JSONL items, no live AI call
                        item = chart_engine.get_batch_item(chart, section_name=sec_name)
                        if item:
                            batch_items.append(item)
                    elif chart_engine:
                        # Real-time mode: queue for concurrent execution
                        pending_ai_tasks.append({
                            "chart": chart,
                            "section_name": sec_name,
                            "section_ref": section,
                            "chart_index": idx,
                        })
            except Exception as exc:
                logger.warning("Failed to serialize concept %s: %s", name, exc)

        # ------------------------------------------------------------------
        # PHASE 2: Concurrent AI Generation (I/O-bound, parallelized)
        # Fire all queued calls simultaneously. The AIGuard semaphore
        # limits to 8 concurrent and handles backoff on 429s.
        # ------------------------------------------------------------------
        if pending_ai_tasks and chart_engine:
            import time
            ai_start = time.monotonic()

            async def _generate_one(task: Dict) -> None:
                """Generate AI insights for a single chart (runs under semaphore)."""
                try:
                    h, a = await chart_engine.generate(
                        task["chart"], section_name=task["section_name"]
                    )
                    task["chart"].ai_headline = h
                    task["chart"].ai_deep_analysis = a
                except Exception as e:
                    logger.warning(
                        "[ConcurrentAI] Failed for chart %s: %s",
                        getattr(task["chart"], "chart_id", "?"), e
                    )

            # TASK 3.4: BATCH GROUPING FOR CACHE WARMUP
            # We divide tasks into groups of 8 (matching the AIGuard semaphore).
            # The first wave warms the KV cache prefix. Subsequent waves hit it.
            task_groups = [pending_ai_tasks[i:i + 8] for i in range(0, len(pending_ai_tasks), 8)]
            
            await BatchGrouper.execute_in_waves(
                groups=task_groups,
                execution_fn=_generate_one,
                wave_label="ChartInsights"
            )

            ai_elapsed = time.monotonic() - ai_start
            logger.info(
                "[ConcurrentAI] Completed %d chart insights in %.1fs (batched waves)",
                len(pending_ai_tasks), ai_elapsed
            )

        return sorted(list(sections_map.values()), key=lambda x: x.order)

    def _resolve_class(self, name):
        from backend.analytics_module.src.MySlides.registry import get_registry
        for cls_list in get_registry().values():
            for cls in cls_list:
                if cls.__name__ == name: return cls
        return None

    async def _get_live_submitted_count(self, survey_id: str) -> int:
        return await self.db.tokens.count_documents({"survey_id": survey_id, "status": "submitted"})
