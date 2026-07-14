import logging
import os
import io
import asyncio
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List, Callable, Awaitable, TypeVar
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from .pptx_builder.engine import PPTXEngine
from .pptx_builder.presentation_planner import PresentationPlanner
from .pptx_builder.chart_payload_contract import prepare_report_for_pptx
from .pptx_builder.chart_render_manifest import build_chart_parity_manifest, collect_screen_chart_ids
from .pptx_builder.insight_payload_contract import normalize_insights_for_pptx
from .pptx_builder.narrative_render_manifest import build_narrative_render_manifest
from .pptx_builder.export_validation_manifest import build_export_manifest
from .pptx_builder.pptx_export_forensics import build_export_forensics_manifest
from .pptx_builder.validation_gating import PPTXValidationMode, resolve_validation_mode
from .pptx_builder.hybrid_export.orchestration import HybridExportOrchestrator
from .pptx_builder.hybrid_export.capture_validation import evaluate_download_readiness
from .pptx_builder.hybrid_export.migration_comparison import build_migration_comparison_manifest
from .pptx_builder.hybrid_export.native_builder_policy import summarize_native_builder_policy
from .pptx_builder.hybrid_export.progress import PPTXExportStage
from .pptx_builder.hybrid_export.progress import stage_progress_for_mode
from .pptx_builder.hybrid_export.rollout import resolve_rollout_stage
from .pptx_builder.hybrid_export.capture_progress import (
    AsyncCaptureProgressBridge,
    CaptureProgressEvent,
)
from .pptx_builder.hybrid_export.export_timeouts import PptxExportTimeouts
from .pptx_builder.hybrid_export.pptx_failure import (
    PptxExportCancelled,
    PptxExportTimeout,
    build_classified_error,
)
from backend.utils.pptx_job_state import (
    ERROR_CODE_VALIDATION,
    PPTX_STATUS_FAILED,
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_READY,
    begin_job_update_fields,
    finalize_pptx_job_cancelled,
    finalize_pptx_job_failure,
    is_cancel_requested,
    terminal_job_update_fields,
    touch_job_update_fields,
)
from backend.utils.report_status_cache import invalidate_status_cache
from backend.utils.pptx_observability import (
    JobTransitionContext,
    JobTimer,
    TRANSITION_STAGE,
    log_job_transition,
    record_capture_manifest_metrics,
)
from backend.utils.pptx_rollout_flags import is_capture_progress_enabled

T = TypeVar("T")

logger = logging.getLogger(__name__)

class PPTXGeneratorV2:
    """
    Advanced Presentation Lifecycle Manager for Questioner V2.
    Orchestrates: 
    - Database state management (Queued -> Ready).
    - Resource coordination (Logos, Themes).
    - High-fidelity native generation via PPTXEngine.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.engine = PPTXEngine()
        
        # Storage Configuration: Prioritize environment variable, then try common locations
        env_reports_dir = os.getenv("REPORTS_DIR")
        if env_reports_dir:
            self.output_dir = Path(env_reports_dir)
        else:
            # Fallback logic for Docker vs Local
            # In Docker with ./backend:/app mount, 'reports' is at /app/reports
            # Locally from root, it might be backend/reports
            if Path("reports").exists() or os.path.exists("reports"):
                self.output_dir = Path("reports")
            else:
                self.output_dir = Path("backend/reports")
        
        os.makedirs(self.output_dir, exist_ok=True)
        self.export_orchestrator = HybridExportOrchestrator(self.output_dir)
        self._timeouts = PptxExportTimeouts.from_env()
        self._current_stage = PPTXExportStage.PREPARING.value
        self._job_deadline: float = 0.0
        self._obs_context = JobTransitionContext()
        logger.info(f"[PPTX-V2] Output directory initialized at: {self.output_dir.absolute()}")

    def _set_stage(self, stage: str) -> None:
        self._current_stage = stage

    def _check_job_deadline(self) -> None:
        if self._job_deadline and time.monotonic() > self._job_deadline:
            raise PptxExportTimeout(
                "export",
                self._timeouts.total_export,
                f"Total export exceeded {self._timeouts.total_export}s",
            )

    async def _ensure_not_cancelled(self, report_id: str, survey_id: Optional[str]) -> None:
        self._check_job_deadline()
        if await is_cancel_requested(self.db, report_id):
            await finalize_pptx_job_cancelled(
                self.db,
                report_id,
                str(survey_id or ""),
                stage=self._current_stage,
            )
            raise PptxExportCancelled(stage=self._current_stage)

    async def _run_stage(
        self,
        report_id: str,
        survey_id: Optional[str],
        stage: str,
        coro: Awaitable[T],
    ) -> T:
        self._set_stage(stage)
        await self._ensure_not_cancelled(report_id, survey_id)
        timeout = self._timeouts.stage_timeout(stage)
        timer = JobTimer()
        log_job_transition(
            TRANSITION_STAGE,
            JobTransitionContext(
                job_id=self._obs_context.job_id,
                survey_id=survey_id or self._obs_context.survey_id,
                report_id=report_id,
                stage=stage,
                worker_id=self._obs_context.worker_id,
                attempt=self._obs_context.attempt,
            ),
        )
        try:
            result = await asyncio.wait_for(coro, timeout=timeout)
            log_job_transition(
                TRANSITION_STAGE,
                JobTransitionContext(
                    job_id=self._obs_context.job_id,
                    survey_id=survey_id or self._obs_context.survey_id,
                    report_id=report_id,
                    stage=stage,
                    duration_ms=timer.duration_ms,
                    worker_id=self._obs_context.worker_id,
                ),
                extra={"stage_outcome": "ok"},
            )
            return result
        except asyncio.TimeoutError as exc:
            raise PptxExportTimeout(stage, timeout) from exc

    async def _update_status(
        self,
        report_id: str,
        status: str,
        progress: int,
        *,
        stage: Optional[str] = None,
        error: Optional[Any] = None,
        extra: Optional[Dict[str, Any]] = None,
        survey_id: Optional[str] = None,
        terminal: bool = False,
        retryable: bool = True,
    ):
        """Updates normalized PPTX job fields and invalidates status cache."""
        if terminal:
            update_data = terminal_job_update_fields(
                status=status,
                progress=progress,
                stage=stage or "failed",
                error=error,
                retryable=retryable,
                extra=extra,
            )
        else:
            update_data = touch_job_update_fields(
                status=status,
                progress=progress,
                stage=stage,
                error=error,
                extra=extra,
            )

        await self.db.get_collection("survey_reports").update_one(
            {"_id": ObjectId(report_id)},
            {"$set": update_data},
        )
        if survey_id:
            await invalidate_status_cache(str(survey_id))

        logger.info(
            "[PPTX-V2] Report %s | Status: %s | Stage: %s | Progress: %s%%",
            report_id,
            status,
            stage or "-",
            progress,
        )

    async def _apply_capture_progress(
        self,
        report_id: str,
        survey_id: Optional[str],
        event: CaptureProgressEvent,
    ) -> None:
        """Persist granular chart-capture progress (40–64% band) + heartbeats."""
        extra = event.as_mongo_fields()
        await self._update_status(
            report_id,
            PPTX_STATUS_PROCESSING,
            event.progress_percent,
            stage=PPTXExportStage.CAPTURING_CHARTS.value,
            extra=extra,
            survey_id=survey_id,
        )

    async def _run_hybrid_capture(
        self,
        report_id: str,
        survey_id: str,
        report_doc: Dict[str, Any],
    ):
        """Execute browser capture with progress bridge, cancel polling, and batch timeout."""
        self._set_stage(PPTXExportStage.CAPTURING_CHARTS.value)
        stage_progress = stage_progress_for_mode(self.export_orchestrator.render_mode.value)
        capture_requests = self.export_orchestrator.build_capture_requests(report_doc)
        total = len(capture_requests)

        await self._update_status(
            report_id,
            PPTX_STATUS_PROCESSING,
            stage_progress[PPTXExportStage.CAPTURING_CHARTS],
            stage=PPTXExportStage.CAPTURING_CHARTS.value,
            extra={
                "pptx_capture_total": total,
                "pptx_capture_completed": 0,
                "pptx_stage_detail": f"Preparing capture of {total} chart(s)",
            },
            survey_id=survey_id,
        )

        self.export_orchestrator.prepare_capture_artifacts(str(report_id))
        loop = asyncio.get_event_loop()
        progress_enabled = is_capture_progress_enabled()
        bridge = None
        pump_task = None
        if progress_enabled:
            bridge = AsyncCaptureProgressBridge(
                loop,
                lambda event: self._apply_capture_progress(report_id, survey_id, event),
                heartbeat_interval_sec=float(os.getenv("PPTX_CAPTURE_HEARTBEAT_SEC", "10")),
            )
            pump_task = asyncio.create_task(bridge.consume_until_done())

        cancel_flag = {"value": False}
        poll_stop = asyncio.Event()

        async def _poll_cancel():
            while not poll_stop.is_set():
                if await is_cancel_requested(self.db, report_id):
                    cancel_flag["value"] = True
                try:
                    await asyncio.wait_for(poll_stop.wait(), timeout=2.0)
                    break
                except asyncio.TimeoutError:
                    pass

        poll_task = asyncio.create_task(_poll_cancel())

        def _cancel_checker() -> bool:
            return cancel_flag["value"]

        report_doc_fresh = await self.db.get_collection("survey_reports").find_one(
            {"_id": ObjectId(report_id)},
            {"pptx_job_id": 1},
        )
        job_id = (report_doc_fresh or {}).get("pptx_job_id")

        capture_timer = JobTimer()

        def _capture_sync():
            return self.export_orchestrator.run_capture_batch(
                str(report_id),
                str(survey_id),
                capture_requests,
                progress_callback=bridge.emit if bridge else None,
                cancel_checker=_cancel_checker,
                job_id=str(job_id) if job_id else None,
            )

        try:
            manifest = await asyncio.wait_for(
                loop.run_in_executor(None, _capture_sync),
                timeout=self._timeouts.capture_batch,
            )
            record_capture_manifest_metrics(
                manifest,
                job_id=str(job_id) if job_id else self._obs_context.job_id,
                survey_id=str(survey_id),
                report_id=str(report_id),
                batch_duration_ms=capture_timer.duration_ms,
            )
            return manifest
        finally:
            poll_stop.set()
            poll_task.cancel()
            try:
                await poll_task
            except asyncio.CancelledError:
                pass
            if bridge and pump_task:
                bridge.stop()
                await pump_task

    def _extract_opportunity_insights(self, report_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Safely extracts opportunity insights from the report document.
        Handles both the Pydantic model structure in MongoDB and raw dictionaries.
        Ensures high-fidelity data transfer to the PPTX Engine.
        """
        try:
            insights_data = report_doc.get("insights", {})
            if not insights_data:
                return []
            
            # Navigate to the correct key (consistent with backend.models.ReportInsights)
            # Some reports might store directly as a list if serialized early
            opp_list = []
            if isinstance(insights_data, dict):
                opp_list = insights_data.get("opportunity_insights", [])
            else:
                # Fallback for unexpected model-like objects
                opp_list = getattr(insights_data, "opportunity_insights", [])
            
            if not isinstance(opp_list, list):
                return []

            # Advanced Normalization: 
            # Ensure every insight is a dict and handle Pydantic serialization
            normalized_opps = []
            for item in opp_list:
                if not item: continue
                
                # Handle Pydantic V2/V1 model serialization
                if hasattr(item, "model_dump"):
                    data = item.model_dump()
                elif hasattr(item, "dict"):
                    data = item.dict()
                else:
                    data = item
                
                if isinstance(data, dict):
                    normalized_opps.append(data)
            
            logger.info(f"[PPTX-V2] Extracted {len(normalized_opps)} opportunity insights for processing.")
            return normalized_opps
        except Exception as e:
            logger.warning(f"[PPTX-V2] Strategic Extraction failed: {e}")
            return []

    def _enrich_strategic_narrative(self, report_doc: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synthesizes the 3-phase strategic narrative directly in the pipeline.
        Ensures structural parity between AI insights and the high-impact slide 4.
        """
        insights = report_doc.get("insights", {})
        
        # 1. Broad Observations / Phased Strategic Roadmap
        # We ensure 'broad_observations' is populated for the builder
        if not insights.get("broad_observations"):
            findings = insights.get("key_findings") or insights.get("findings", [])
            # Systematic derivation of the top 3 pillars
            insights["broad_observations"] = findings[:3]
            
        # 2. Strategic Narrative Synthesis (Framing Statement)
        if not insights.get("strategic_narrative"):
            brand = metadata.get("brand", "the client brand")
            category = metadata.get("category", "the category")
            research_type = metadata.get("research_type", "strategic")
            insights["strategic_narrative"] = (
                f"This {research_type} engagement synthesizes consumer sentiment and "
                f"competitive market signals to architect a growth roadmap for {brand} within {category}."
            )
            
        # 3. Core Project Goal
        if not insights.get("business_question") and not insights.get("project_goal"):
            brand = metadata.get("brand", "Brand")
            category = metadata.get("category", "Category")
            insights["business_question"] = f"How can {brand} unlock incremental volume and brand stickiness within the {category} landscape?"
            
        report_doc["insights"] = insights
        return report_doc

    def _enrich_premium_slides(self, report_doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Binds AI insights from slide_insights to premium charts.
        Ensures Brand Profiles and Criteria Analysis slides have their generated narrative context.
        """
        insights = report_doc.get("insights", {})
        slide_insights = insights.get("slide_insights", {})
        charts = report_doc.get("charts", [])
        
        if not slide_insights or not charts:
            return report_doc
            
        # Target IDs for premium narrative binding
        premium_targets = {
            "criteria_table",
            "brand_profile_snake",
            "likeness_profile_chart",
            "brand_comparison_pi_ol",
            "purchase_funnel",
            "purchase_intent",
            "brand_awareness",
            "purchase_funnel_ratio_cards",
            "purchase_funnel_reference_table",
            "nps_recommend",
            "importance_combined",
            "sigma_intent"
        }

        for chart in charts:
            chart_id = chart.get("chart_id", "")
            
            # 1. Handle Brand Card scorecards (Dynamic N-Slide logic)
            if chart.get("chart_type") == "scorecard" and chart_id.startswith("brand_card_"):
                ai_text = slide_insights.get(chart_id)
                if ai_text:
                    chart["_enriched_ai_insight"] = ai_text
                    logger.debug(f"[PPTX-V2] Enriched brand profile {chart_id} with AI insight.")
            
            # 2. Handle specific Criteria Analysis premium charts
            elif chart_id in premium_targets:
                ai_text = slide_insights.get(chart_id)
                if ai_text:
                    chart["_enriched_ai_insight"] = ai_text
                    logger.debug(f"[PPTX-V2] Enriched premium chart {chart_id} with AI insight.")
                    
        return report_doc

    def _build_contract_coverage_warning(self, charts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Build a structured warning when any chart resolves to the generic fallback table.
        This keeps hybrid fallback dormant while exposing native coverage gaps to diagnostics.
        """
        unsupported_count = self.engine.chart_resolver.count_unsupported(charts)
        if unsupported_count <= 0:
            return {
                "has_coverage_gap": False,
                "unsupported_count": 0,
                "fallback_items": [],
            }

        fallback_items: List[Dict[str, Any]] = []
        for chart in charts:
            if not isinstance(chart, dict):
                continue
            contract = self.engine.chart_resolver.describe_export_contract(chart)
            if contract.get("uses_fallback_table"):
                fallback_items.append(contract)

        warning = {
            "has_coverage_gap": True,
            "unsupported_count": unsupported_count,
            "fallback_items": fallback_items,
        }
        logger.warning(
            "[PPTX-V2] Native coverage gap detected: %s chart(s) will resolve to fallback_table.",
            unsupported_count,
        )
        return warning

    async def generate(self, report_id: str) -> str:
        """
        The production entry point for V2 generation.
        Fetches the finalized report document and runs it through the native engine.
        """
        # 1. Fetch Report Data
        report_doc = await self.db.get_collection("survey_reports").find_one({"_id": ObjectId(report_id)})
        if not report_doc:
            logger.error(f"[PPTX-V2] Report {report_id} not found.")
            return ""

        survey_id = str(report_doc.get("survey_id") or "")
        stage_progress = stage_progress_for_mode(self.export_orchestrator.render_mode.value)
        self._obs_context = JobTransitionContext(
            job_id=report_doc.get("pptx_job_id"),
            survey_id=survey_id or None,
            report_id=report_id,
            attempt=int(report_doc.get("pptx_attempt") or 1),
            worker_id=report_doc.get("pptx_worker_id"),
        )

        # API may have already enqueued job metadata via begin_job_update_fields
        if report_doc.get("pptx_status") != PPTX_STATUS_PROCESSING or not report_doc.get("pptx_job_id"):
            init_fields = begin_job_update_fields(
                report_doc,
                stage=PPTXExportStage.PREPARING.value,
                progress=stage_progress[PPTXExportStage.PREPARING],
                extra={
                    "pptx_render_mode": self.export_orchestrator.render_mode.value,
                    "pptx_rollout_stage": resolve_rollout_stage().value,
                },
            )
            await self.db.get_collection("survey_reports").update_one(
                {"_id": ObjectId(report_id)},
                {"$set": init_fields},
            )
            if survey_id:
                await invalidate_status_cache(survey_id)
        else:
            await self._update_status(
                report_id,
                PPTX_STATUS_PROCESSING,
                stage_progress[PPTXExportStage.PREPARING],
                stage=PPTXExportStage.PREPARING.value,
                extra={
                    "pptx_render_mode": self.export_orchestrator.render_mode.value,
                    "pptx_rollout_stage": resolve_rollout_stage().value,
                    "pptx_error": None,
                },
                survey_id=survey_id or None,
            )
        
        # LOG: Filtered report behavior (UI Slices are not persisted)
        logger.info("[PPTX-V2] PPTX exports the base report only. UI-filtered slices are not persisted.")

        self._job_deadline = time.monotonic() + self._timeouts.total_export

        try:
            # Normalize and sync strategic content across all builders
            normalized_opportunities = self._extract_opportunity_insights(report_doc)
            if "insights" in report_doc and isinstance(report_doc["insights"], dict):
                report_doc["insights"]["opportunity_insights"] = normalized_opportunities

            normalize_insights_for_pptx(report_doc)
            base_survey_id = str(report_doc.get("survey_id") or "")

            async def _fetch_survey_doc_async() -> Dict[str, Any]:
                if not base_survey_id:
                    return {}
                query = (
                    {"_id": ObjectId(base_survey_id)}
                    if ObjectId.is_valid(base_survey_id)
                    else {"_id": base_survey_id}
                )
                return await self.db.get_collection("surveys").find_one(query) or {}

            prep_task = asyncio.to_thread(
                prepare_report_for_pptx,
                report_doc,
                self.engine.chart_resolver,
            )
            survey_task = asyncio.create_task(_fetch_survey_doc_async())
            preparation, survey_doc = await asyncio.gather(prep_task, survey_task)
            report_doc = preparation.report_doc
            screen_chart_ids = collect_screen_chart_ids(report_doc)
            await self._ensure_not_cancelled(report_id, survey_id or None)
            # 2. Fetch Parent Survey Metadata (Phase 1 Data Enrichment)
            survey_id = report_doc.get("survey_id")

            if not survey_doc:
                logger.warning(f"[PPTX-V2] Parent survey {survey_id} not found for report {report_id}. Some metadata will be missing.")
                survey_doc = {}

            # 3. Advanced Metadata Extraction
            blueprint = survey_doc.get("blueprint", {})
            
            # Brand Roster Extraction
            brands_data = blueprint.get("brands", [])
            if not brands_data:
                # Fallback to legacy structure
                brands_data = survey_doc.get("internal_brands_data", []) + survey_doc.get("competitor_brands_data", [])
            
            brands_list = [b.get("name") for b in brands_data if b.get("name")]
            
            # Logic Fix: Multi-Channel Purchase Funnel Detection (Phase 1 V2)
            pf_brands = [b.get("name") for b in brands_data if b.get("is_pf_aided")]
            
            if not pf_brands:
                # Channel 2: Integrated Purchase Funnel Object
                pf_obj = survey_doc.get("purchase_funnel")
                if isinstance(pf_obj, dict) and (pf_obj.get("is_enabled") or pf_obj.get("brand_list")):
                    pf_brands = [b.get("name_en") or b.get("name") for b in pf_obj.get("brand_list", [])]
            
            if not pf_brands:
                # Channel 3: PF Config Sync
                pf_config = survey_doc.get("pf_config")
                if isinstance(pf_config, dict) and pf_config.get("enabled"):
                    pf_brands = pf_config.get("brands", [])

            # Advanced Data Enrichment: Attribute & Category Extraction (Phase 3 Hardened)
            raw_attributes = blueprint.get("attributes", {})
            custom_attr_configs = blueprint.get("custom_research_attributes", [])
            
            flat_attributes = []
            category_summary = []
            
            # 1. Process Standard Blueprint Attributes
            if isinstance(raw_attributes, dict):
                sorted_cats = sorted(raw_attributes.items(), key=lambda x: len(x[1]) if isinstance(x[1], list) else 0, reverse=True)
                for cat_name, attrs in sorted_cats:
                    if isinstance(attrs, list) and attrs:
                        flat_attributes.extend(attrs)
                        category_summary.append(f"{cat_name} ({len(attrs)})")
            
            # 2. Process Custom Research Attributes (Logic Fix)
            if isinstance(custom_attr_configs, list) and custom_attr_configs:
                custom_main_count = 0
                for c_attr in custom_attr_configs:
                    main_name = c_attr.get("main_attribute")
                    subs = c_attr.get("sub_attributes", [])
                    if main_name:
                        flat_attributes.append(main_name)
                        custom_main_count += 1
                        # Include sub-attributes in the global count
                        for s_attr in subs:
                            sub_label = s_attr.get("label")
                            if sub_label:
                                flat_attributes.append(sub_label)
                
                if custom_main_count > 0:
                    category_summary.append(f"Custom Research ({custom_main_count})")

            # Finalize Categories
            if not category_summary and isinstance(raw_attributes, list):
                flat_attributes = raw_attributes
                category_summary = ["General Attributes"]

            metadata = {
                "title": report_doc.get("project_name", "Analytical Report"),
                "brand": report_doc.get("brand") or survey_doc.get("company_name") or "Confidential Analysis",
                "date": datetime.now().strftime("%B %Y"),
                
                # Survey Info Enrichment
                "target_brand": blueprint.get("own_brand") or report_doc.get("brand", "N/A"),
                "category": blueprint.get("category", "Market Research"),
                "brands": brands_list,
                "pf_brands": pf_brands,
                "company_name": survey_doc.get("company_name", "N/A"),
                "pf_active": len(pf_brands) > 0,
                
                # Phase 2 & 5 Metrics: Attribute & Diagnostic Scope
                "total_attributes": len(flat_attributes),
                "top_attributes": flat_attributes[:10],
                "attribute_categories": category_summary[:5], # Top 5 Categories
                "attributes_summary": ", ".join(flat_attributes[:10]), # Clean summary string
                "survey_created_at": survey_doc.get("created_at"),
                "report_generated_at": report_doc.get("generated_at"),
                
                # Data Health Metrics
                "total_responses": report_doc.get("total_responses", 0),
                "base_n": report_doc.get("base_n", 0),
                "sample_capacity": survey_doc.get("sample_capacity", 0),
                "research_type": report_doc.get("research_type", "Standard"),
            }
            
            # Phase 3 Hardened: Strategic Narrative Enrichment
            report_doc = self._enrich_strategic_narrative(report_doc, metadata)
            
            # Phase 2 & 3 Advanced: Premium Slide AI Enrichment
            report_doc = self._enrich_premium_slides(report_doc)
            
            # 4. Define Presentation Intents (Structural Parity - Phase 1)
            # Replicates frontend grouping and ordering logic
            report_doc_for_planner = {
                **report_doc,
                "metadata": metadata,
                "opportunities": normalized_opportunities
            }
            intents = PresentationPlanner.define_slide_intents(report_doc_for_planner)
            contract_warning = self._build_contract_coverage_warning(
                report_doc.get("charts", []) or []
            )
            await self._ensure_not_cancelled(report_id, survey_id or None)

            migration_strategy = {
                "rollout_stage": resolve_rollout_stage().value,
                "render_mode": self.export_orchestrator.render_mode.value,
                "pipeline_comparison": build_migration_comparison_manifest(report_doc),
                "native_builder_policy": summarize_native_builder_policy(),
            }
            logger.info(
                "[PPTX-V2] Export render mode=%s rollout=%s capture_enabled=%s",
                migration_strategy["render_mode"],
                migration_strategy["rollout_stage"],
                self.export_orchestrator.should_capture(),
            )

            capture_manifest = None
            is_hybrid_mode = self.export_orchestrator.render_mode.value == "hybrid"
            if is_hybrid_mode and self.export_orchestrator.should_capture() and survey_id:
                capture_manifest = await self._run_stage(
                    report_id,
                    survey_id or None,
                    PPTXExportStage.CAPTURING_CHARTS.value,
                    self._run_hybrid_capture(report_id, str(survey_id), report_doc),
                )
                report_doc = self.export_orchestrator.merge_capture_results(report_doc, capture_manifest)
                failures = self.export_orchestrator.capture_failures(capture_manifest)
                if failures:
                    logger.warning(
                        "[PPTX-V2] Hybrid capture completed with %s failed chart(s) for report %s",
                        len(failures),
                        report_id,
                    )
                await self._update_status(
                    report_id,
                    PPTX_STATUS_PROCESSING,
                    stage_progress[PPTXExportStage.ASSEMBLING_DECK] - 1,
                    stage=PPTXExportStage.CAPTURING_CHARTS.value,
                    extra={
                        "pptx_capture_completed": capture_manifest.success_count,
                        "pptx_capture_total": len(capture_manifest.captures),
                        "pptx_stage_detail": (
                            f"Capture complete ({capture_manifest.success_count}/"
                            f"{len(capture_manifest.captures)} charts)"
                        ),
                        "pptx_capture_manifest": self.export_orchestrator.manifest_for_storage(
                            capture_manifest
                        ),
                    },
                    survey_id=survey_id or None,
                )
            elif self.export_orchestrator.should_capture() and not is_hybrid_mode:
                logger.info(
                    "[PPTX-V2] Capture pipeline skipped because render mode is '%s'.",
                    self.export_orchestrator.render_mode.value,
                )

            await self._update_status(
                report_id,
                PPTX_STATUS_PROCESSING,
                stage_progress[PPTXExportStage.ASSEMBLING_DECK],
                stage=PPTXExportStage.ASSEMBLING_DECK.value,
                extra={"pptx_stage_detail": "Assembling native slides and builders"},
                survey_id=survey_id or None,
            )

            async def _assemble_presentation():
                max_retries = 3
                pptx_stream_local = None
                slide_count = 0
                for attempt in range(max_retries):
                    try:
                        logger.info(
                            "[PPTX-V2] Generation Attempt %s/%s",
                            attempt + 1,
                            max_retries,
                        )
                        pptx_stream_local, slide_count = self.engine.generate_presentation(
                            intents
                        )
                        break
                    except Exception as exc:
                        if attempt == max_retries - 1:
                            raise exc
                        logger.warning(
                            "[PPTX-V2] Transient failure on attempt %s: %s. Retrying...",
                            attempt + 1,
                            exc,
                        )
                        await asyncio.sleep(1 * (attempt + 1))
                if pptx_stream_local is None:
                    raise RuntimeError("PPTX engine failed to produce a presentation stream")
                return pptx_stream_local, slide_count

            pptx_stream, actual_slide_count = await self._run_stage(
                report_id,
                survey_id or None,
                PPTXExportStage.ASSEMBLING_DECK.value,
                _assemble_presentation(),
            )

            # 6. Integrity Validation (Phase 6 Advanced)
            from .pptx_builder.validator import PPTXIntegrityValidator

            await self._update_status(
                report_id,
                PPTX_STATUS_PROCESSING,
                stage_progress[PPTXExportStage.VALIDATING],
                stage=PPTXExportStage.VALIDATING.value,
                extra={"pptx_stage_detail": "Running validation and forensic checks"},
                survey_id=survey_id or None,
            )

            async def _validate_presentation():
                validation_mode = resolve_validation_mode()
                validator = PPTXIntegrityValidator(pptx_stream)
                return await validator.validate(
                    report_doc,
                    intents,
                    mode=validation_mode,
                    render_journal=self.engine.render_journal,
                    narrative_journal=self.engine.narrative_render_journal,
                )

            validation_mode = resolve_validation_mode()
            certification = await self._run_stage(
                report_id,
                survey_id or None,
                PPTXExportStage.VALIDATING.value,
                _validate_presentation(),
            )

            chart_parity = build_chart_parity_manifest(
                screen_chart_ids=screen_chart_ids,
                normalized_charts=preparation.normalized_charts,
                render_journal=self.engine.render_journal,
            )
            narrative_manifest = build_narrative_render_manifest(
                report_doc=report_doc,
                intents=intents,
                text_markers=certification.get("export_audit", {}).get("text_markers", {}),
                narrative_journal=self.engine.narrative_render_journal,
            )

            if certification.get("passes_gate"):
                logger.info("[PPTX-V2] Integrity certified for %s in %s mode", report_id, validation_mode.value)
            else:
                logger.warning(
                    "[PPTX-V2] Validation gate failed for %s in %s mode: %s",
                    report_id,
                    validation_mode.value,
                    certification.get("validation_errors", certification.get("discrepancies", "unknown")),
                )

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"V2_Report_{report_id}_{timestamp}.pptx"
            file_path = self.output_dir / filename

            pptx_bytes = pptx_stream.getvalue()
            with open(file_path, "wb") as f:
                f.write(pptx_bytes)

            import hashlib

            capture_manifest_payload = (
                self.export_orchestrator.manifest_for_storage(capture_manifest)
                if capture_manifest is not None
                else None
            )

            export_manifest = build_export_manifest(
                report_id=str(report_id),
                generated_at=datetime.utcnow().isoformat(),
                template_hash=hashlib.md5(pptx_bytes[:1024]).hexdigest(),
                certification=certification,
                report_doc=report_doc,
                preparation_snapshot=preparation.snapshot,
                chart_normalization_notes=preparation.normalization_notes,
                chart_parity=chart_parity,
                narrative_render_manifest=narrative_manifest,
                layout_geometry=getattr(self.engine, "layout_geometry", {}),
                actual_slide_count=actual_slide_count,
                capture_manifest=capture_manifest_payload,
            )
            export_manifest["automation_notes"] = list(getattr(self.engine, "automation_notes", []))
            export_manifest.setdefault("contract_warnings", [])
            if contract_warning.get("has_coverage_gap"):
                export_manifest["contract_warnings"].append(
                    {
                        "type": "native_builder_fallback_table",
                        "severity": "warning",
                        "unsupported_count": contract_warning["unsupported_count"],
                        "message": (
                            "Some charts resolved to fallback_table. "
                            "Native builder coverage is incomplete for these chart mappings."
                        ),
                        "items": contract_warning["fallback_items"],
                    }
                )
            export_manifest["export_forensics"] = build_export_forensics_manifest(
                report_doc=report_doc,
                intents=intents,
                preparation_snapshot=preparation.snapshot,
                normalization_notes=preparation.normalization_notes,
                render_journal=self.engine.render_journal,
                narrative_journal=self.engine.narrative_render_journal,
                certification=certification,
                pptx_bytes=pptx_bytes,
                capture_manifest=capture_manifest_payload,
            )
            export_manifest["passes_forensic_gate"] = export_manifest["export_forensics"].get(
                "passes_forensic_gate",
                False,
            )

            passes_export = certification.get("passes_gate", False)
            if validation_mode == PPTXValidationMode.PRODUCTION:
                passes_export = passes_export and export_manifest["passes_forensic_gate"]

            export_manifest["download_readiness"] = evaluate_download_readiness(
                export_manifest=export_manifest,
                pptx_path=str(file_path.absolute()) if passes_export else None,
            )
            export_manifest["migration_strategy"] = migration_strategy

            final_status = PPTX_STATUS_READY if passes_export else PPTX_STATUS_FAILED
            terminal_stage = (
                PPTXExportStage.READY.value
                if final_status == PPTX_STATUS_READY
                else "failed"
            )
            terminal_progress = (
                stage_progress[PPTXExportStage.READY]
                if final_status == PPTX_STATUS_READY
                else 0
            )
            terminal_error = None
            if final_status == PPTX_STATUS_FAILED:
                terminal_error = build_classified_error(
                    Exception("PPTX export failed validation gate."),
                    stage="validation",
                    extra={
                        "validation_errors": export_manifest["validation_errors"],
                        "validation_warnings": export_manifest["validation_warnings"],
                    },
                )
                terminal_error["code"] = ERROR_CODE_VALIDATION

            update_payload = terminal_job_update_fields(
                status=final_status,
                progress=terminal_progress,
                stage=terminal_stage,
                error=terminal_error,
                retryable=True,
                extra={
                    "pptx_path": str(file_path.absolute()),
                    "pptx_ready_at": datetime.now() if final_status == PPTX_STATUS_READY else None,
                    "pptx_render_mode": self.export_orchestrator.render_mode.value,
                    "pptx_rollout_stage": resolve_rollout_stage().value,
                    "pptx_contract_warnings": export_manifest.get("contract_warnings", []),
                    "pptx_export_manifest": export_manifest,
                },
            )
            if capture_manifest is not None:
                update_payload["pptx_capture_manifest"] = self.export_orchestrator.manifest_for_storage(
                    capture_manifest
                )

            await self.db.get_collection("survey_reports").update_one(
                {"_id": ObjectId(report_id)},
                {"$set": update_payload},
            )
            if survey_id:
                await invalidate_status_cache(survey_id)

            self.export_orchestrator.maybe_cleanup_after_export(
                str(report_id),
                export_succeeded=final_status == PPTX_STATUS_READY,
            )

            if final_status == PPTX_STATUS_FAILED:
                logger.error("[PPTX-V2] Generation blocked by validation gate: %s", file_path)
                return ""

            logger.info(f"[PPTX-V2] Generation Successful: {file_path}")
            return str(file_path.absolute())

        except PptxExportCancelled as exc:
            logger.info("[PPTX-V2] Export cancelled | report=%s", report_id)
            await finalize_pptx_job_cancelled(
                self.db,
                report_id,
                str(survey_id or ""),
                stage=exc.stage or self._current_stage,
                message=str(exc),
            )
            return ""

        except Exception as exc:
            logger.error(
                "[PPTX-V2] Generation failed at stage '%s': %s",
                self._current_stage,
                exc,
                exc_info=True,
            )
            await finalize_pptx_job_failure(
                self.db,
                report_id,
                str(survey_id or ""),
                exc,
                stage=self._current_stage,
            )
            return ""
