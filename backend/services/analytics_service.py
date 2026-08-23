import os
import json
import logging
import traceback
import asyncio
import pandas as pd
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
from fastapi import BackgroundTasks

# Assuming these exist in the codebase
from backend.database import get_database 
from backend.analytics_module.main import SurveyAnalyzer
from backend.analytics_module.platform_bridge import PlatformBridge
from backend.analytics_module.config_loader import load_app_config
from backend.analytics_module.chart_insight_engine import ChartInsightEngine
from backend.analytics_module.src.ai.verbatim_analyzer import VerbatimAnalyzer
from backend.analytics_module.insight_aggregator import InsightAggregator
from backend.analytics_module.src.ai.model_router import ModelRouter
from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
from backend.analytics_module.src.ai.quota_monitor import QuotaMonitor
from backend.analytics_module.src.ai import AIGuard, api_cost
from backend.utils.cache_utils import cache
from backend.models import ReportInsights, KeyFinding, ReportDataContext, SurveyContextBlock
from bson import ObjectId

from backend.analytics_module.src.ai.opportunity_detector import OpportunityDetector
from backend.analytics_module.src.ai.opportunity_nlp import OpportunityNLPAnalyzer
from backend.analytics_module.src.ai.opportunity_synthesizer import OpportunitySynthesizer

logger = logging.getLogger(__name__)


def _ai_contract_version() -> str:
    """
    Short fingerprint of the active god prompt.

    Stored on every report so a stale worker is immediately visible: if the
    prompt file changed but this value did not, the running process has not
    reloaded the new prompt.
    """
    try:
        import json
        from pathlib import Path as _Path

        meta_path = (
            _Path(__file__).resolve().parents[1]
            / "resources" / "analytics" / "prompts" / "god_prompt_meta.json"
        )
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return f'{meta.get("version", "?")}+{meta.get("sha256", "?")}'
    except Exception:  # noqa: BLE001 - telemetry must never break generation
        return "unknown"


class AnalyticsService:
    """
    Service layer to handle analytical report generation requests.
    Ties together MongoDB data and the Analytical Module.
    """
    
    def __init__(self):
        from backend.database import db
        self._db_manager = db
        self.resource_dir = os.getenv("ANALYTICS_RESOURCES_DIR", "backend/resources/analytics")
        self.output_root = os.getenv("ANALYTICS_OUTPUT_DIR", "backend/presintion report")
        os.makedirs(self.output_root, exist_ok=True)
        # In-memory cache for fast dynamic slicing (Phase 1)
        self._survey_data_cache: Dict[str, Any] = {}

    @property
    def db(self):
        """Dynamic access to the database instance to ensure connection is ready."""
        if self._db_manager.db is None:
             # In some lifecycle stages, it might be None, so we handle it
             pass
        return self._db_manager.db

    def _get_cache_key(self, survey_id: str, options: Dict[str, Any]) -> str:
        # Generate a unique key based on survey_id and requested options
        opt_str = json.dumps(options, sort_keys=True)
        return f"analytics:report:{survey_id}:{hash(opt_str)}"

    async def get_attribute_registry(self, survey_doc: dict) -> List[Dict[str, Any]]:
        """
        Build a high-fidelity attribute registry by prioritizing the survey's live snapshot.
        This ensures that client-edited labels/scales are reflected in the report.

        Product test surveys return the Phase 5 product_test attribute registry
        (timing + diagnostic_tag + module) instead of taste-test main/supp attributes.
        """
        from backend.services.product_test_analytics_service import (
            resolve_product_test_attribute_registry_for_survey,
        )
        from backend.services.product_test_public_gateway import is_product_test_survey

        if is_product_test_survey(survey_doc):
            return resolve_product_test_attribute_registry_for_survey(survey_doc)

        registry = []
        config = survey_doc.get("taste_test_config") or {}
        attr_sequence = config.get("attribute_sequence", [])
        snapshot = survey_doc.get("template_snapshot_l2") or {}
        sections = snapshot.get("sections", [])
        
        # 1. Map all scale-5 questions from the snapshot by attribute name
        # Key: attribute_name_lower, Value: list of scale-5 metadata
        snapshot_map = {}
        for section in sections:
            main_att = (section.get("attribute") or "").strip().lower()
            if not main_att: continue
            
            if main_att not in snapshot_map:
                snapshot_map[main_att] = []
            
            for q in section.get("questions", []):
                meta = q.get("questionMeta", {})
                # We identify "sub-attribute" questions by scale 5
                if q.get("type") == "scale" and int(meta.get("scaleMax", 5)) == 5:
                    snapshot_map[main_att].append({
                        "text": q.get("text", q.get("label", "")).strip(),
                        "min_label": (meta.get("minLabel") or "Poor").strip(),
                        "max_label": (meta.get("maxLabel") or "Excellent").strip(),
                        "id": q.get("id")
                    })

        # 2. Build Library Fallback Map (Global defaults)
        library_cursor = self.db.taste_test_questions.find(
            {"supp_att": {"$exists": True}},
            {"_id": 0, "main_att": 1, "supp_att": 1, "en_min_label": 1, "en_max_label": 1, "en_text": 1}
        )
        library_qs = await library_cursor.to_list(length=1000)
        library_map = {q["supp_att"].strip().lower(): q for q in library_qs if q.get("supp_att")}

        # 3. Build Custom Fallback Map (from blueprint)
        blueprint = survey_doc.get("blueprint") or {}
        custom_attrs = blueprint.get("custom_research_attributes", [])
        custom_map = {}
        for cra in custom_attrs:
            for sub in cra.get("sub_attributes", []):
                if isinstance(sub, dict):
                    lbl = (sub.get("label") or "").strip().lower()
                    if lbl:
                        custom_map[lbl] = {
                            "min": (sub.get("minLabel") or "Poor").strip(),
                            "max": (sub.get("maxLabel") or "Excellent").strip(),
                        }
                elif isinstance(sub, str):
                    custom_map[sub.strip().lower()] = {"min": "Poor", "max": "Excellent"}

        # 4. Assemble Registry Following the Attribute Sequence
        for entry in attr_sequence:
            main_name = (entry.get("main_attribute") or "").strip()
            main_lower = main_name.lower()
            source = entry.get("source", "library")
            
            for sub in entry.get("sub_attributes", []):
                sub_label = str(sub).strip()
                if not sub_label: continue
                sub_lower = sub_label.lower()
                
                reg_item = {
                    "main_att": main_name,
                    "supp_att": sub_label,
                    "source": source
                }
                
                # --- STEP A: Determine Source of Truth following User Intent ---
                # For Custom: The blueprint is the explicit intent.
                # For Library: The snapshot is the explicit edit of a default.
                
                custom_meta = custom_map.get(sub_lower) if source == "custom" else None
                matched_snap = None
                if main_lower in snapshot_map:
                    snaps = snapshot_map[main_lower]
                    if len(snaps) == 1:
                        matched_snap = snaps[0]
                    else:
                        for s in snaps:
                            if sub_lower in s["text"].lower() or sub_lower in (s["id"] or "").lower():
                                matched_snap = s
                                break
                        if not matched_snap: matched_snap = snaps[0]

                if source == "custom" and custom_meta:
                    reg_item["min_label"] = custom_meta["min"]
                    reg_item["max_label"] = custom_meta["max"]
                    reg_item["en_text"] = matched_snap["text"] if matched_snap else ""
                elif matched_snap:
                    reg_item["min_label"] = matched_snap["min_label"]
                    reg_item["max_label"] = matched_snap["max_label"]
                    reg_item["en_text"] = matched_snap["text"]
                elif source == "library":
                    lib_q = library_map.get(sub_lower)
                    reg_item["min_label"] = (lib_q.get("en_min_label", "") if lib_q else "") or "Poor"
                    reg_item["max_label"] = (lib_q.get("en_max_label", "") if lib_q else "") or "Excellent"
                    reg_item["en_text"] = lib_q.get("en_text", "") if lib_q else ""
                else:
                    cm = custom_map.get(sub_lower)
                    reg_item["min_label"] = cm["min"] if cm else "Poor"
                    reg_item["max_label"] = cm["max"] if cm else "Excellent"
                    reg_item["en_text"] = ""
                
                registry.append(reg_item)

        logger.info("[AttributeRegistry] Built %d entries from snapshot and fallbacks", len(registry))
        return registry
        


    async def generate_survey_report(self, survey_id: str, background_tasks: BackgroundTasks, options: Dict[str, Any] = None, current_user: Any = None, force: bool = False) -> Dict[str, Any]:
        """
        Main entry point. Starts an asynchronous background task for report generation.
        """
        options = options or {}
        survey_oid = ObjectId(survey_id)
        
        # 0. Audit Log (Trigger)
        if current_user:
            await self.db.audit_logs.insert_one({
                "action": "trigger_analytical_report",
                "user_id": str(current_user.id),
                "username": current_user.username,
                "resource_type": "survey",
                "resource_id": survey_id,
                "timestamp": datetime.utcnow(),
                "details": {"options": options}
            })

        # 1. Update Survey status to processing
        await self.db.surveys.update_one(
            {"_id": survey_oid},
            {"$set": {"report_status": "processing", "last_report_path": None}}
        )

        # 1.5 ATOMIC INITIALIZATION: Create/Update report entry to 'generating'
        # This prevents the frontend from getting a 404 when polling
        await self.db.get_collection("survey_reports").update_one(
            {"survey_id": survey_id},
            {
                "$set": {
                    "status": "generating",
                    "project_name": "Preparing Analysis...",
                    "generated_at": datetime.utcnow(),
                    "error_message": None
                }
            },
            upsert=True
        )
        
        # 2. Add to background tasks
        background_tasks.add_task(self._run_analysis_task, survey_id, options, force=force)
        
        return {
            "status": "generating",
            "message": "Analytical report generation started in background.",
            "survey_id": survey_id
        }

    async def rebuild_pptx_artifact(self, survey_id: str, background_tasks: BackgroundTasks):
        """
        Regenerate PPTX via durable queue (same path as generate-pptx).
        """
        from backend.analytics_module.pptx_builder.hybrid_export.render_mode import resolve_render_mode
        from backend.analytics_module.pptx_builder.hybrid_export.rollout import resolve_rollout_stage
        from backend.workers.pptx_job_service import PPTX_QUEUE_ENABLED, enqueue_pptx_export

        report = await self.db.survey_reports.find_one(
            {"survey_id": survey_id},
            sort=[("generated_at", -1)],
        )
        if not report:
            raise ValueError(f"No existing report found for survey {survey_id}")

        if report.get("status") != "ready":
            raise ValueError("Report must be in 'ready' status to rebuild PPTX artifact.")

        if PPTX_QUEUE_ENABLED:
            payload, _ = await enqueue_pptx_export(
                self.db,
                report,
                survey_id,
                force_retry=True,
                render_meta={
                    "pptx_render_mode": resolve_render_mode().value,
                    "pptx_rollout_stage": resolve_rollout_stage().value,
                },
            )
            return payload

        background_tasks.add_task(self._run_pptx_rebuild_task, survey_id, report)
        return {
            "status": "processing",
            "message": "PPTX artifact regeneration task started (legacy mode).",
            "survey_id": survey_id,
            "delivery": "background_tasks",
        }

    async def _run_pptx_rebuild_task(self, survey_id: str, report_doc: Dict[str, Any]):
        """
        Worker task for PPTX generation with exponential backoff and final fallback.
        """
        from backend.analytics_module.post_processor import ReportPostProcessor
        processor = ReportPostProcessor(self.db, survey_id)
        
        max_retries = 3
        retry_delay = 5  # Initial delay in seconds
        
        for attempt in range(max_retries):
            try:
                logger.info(f"[PPTX-REBUILD] Starting attempt {attempt + 1}/{max_retries} for {survey_id}")
                await processor.run(report_doc)
                logger.info(f"[PPTX-REBUILD] Successfully completed for {survey_id}")
                return
            except Exception as e:
                logger.error(f"[PPTX-REBUILD] Attempt {attempt + 1} failed for {survey_id}: {str(e)}")
                if attempt < max_retries - 1:
                    logger.info(f"[PPTX-REBUILD] Retrying in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    logger.critical(
                        "[PPTX-REBUILD] ALL ATTEMPTS FAILED for %s",
                        survey_id,
                    )
                    from backend.utils.pptx_job_state import finalize_pptx_job_failure

                    report_id = str(report_doc.get("_id") or "")
                    if report_id:
                        await finalize_pptx_job_failure(
                            self.db,
                            report_id,
                            survey_id,
                            e,
                            stage="rebuild",
                        )
                    await self.db.survey_reports.update_one(
                        {"survey_id": survey_id},
                        {
                            "$set": {
                                "telemetry.pptx_generation_failed": True,
                                "telemetry.last_pptx_error": str(e),
                                "pptx_path": None,
                                "status_history": report_doc.get("status_history", [])
                                + [
                                    {
                                        "status": "ready",
                                        "note": f"PPTX generation failed after {max_retries} attempts.",
                                        "timestamp": datetime.utcnow().isoformat(),
                                    }
                                ],
                            }
                        },
                    )

    async def invalidate_survey_cache(self, survey_id: str):
        """Systematic cache invalidation for survey data and reports."""
        survey_id_str = str(survey_id)
        if survey_id_str in self._survey_data_cache:
            del self._survey_data_cache[survey_id_str]
        
        # Also mark any existing report as stale
        await self.invalidate_report(survey_id_str)

    async def invalidate_report(self, survey_id: str):
        """Marks a report as stale so it gets regenerated on next request."""
        survey_id_str = str(survey_id)
        await self.db.survey_reports.update_one(
            {"survey_id": survey_id_str},
            {"$set": {"status": "stale"}}
        )

    async def get_report_status(self, survey_id: str) -> Dict[str, Any]:
        """Retrieves the current status of the report generation task."""
        survey_oid = ObjectId(survey_id)
        survey = await self.db.surveys.find_one({"_id": survey_oid}, {"report_status": 1, "last_report_path": 2, "report_error": 3, "quality_status": 4})
        if not survey:
            raise ValueError(f"Survey {survey_id} not found")
        
        return {
            "survey_id": survey_id,
            "status": survey.get("report_status", "idle"),
            "path": survey.get("last_report_path"),
            "error": survey.get("report_error"),
            "quality": survey.get("quality_status")
        }

    async def slice_survey_report(self, survey_id: str, filters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dynamically filters a SurveyData object and computes a new set of charts.
        Returns just the charts array and base_n instantly for frontend rendering.
        """
        from backend.analytics_module.ingestor import DirectIngestor
        from backend.analytics_module.aggregator import ReportAggregator
        
        survey_data = self._survey_data_cache.get(survey_id)
        if not survey_data:
            survey_doc = await self.db.surveys.find_one({"_id": ObjectId(survey_id)})
            brands = survey_doc.get("customizations", {}).get("brands", []) if survey_doc else []
            survey_data = await DirectIngestor.load(self.db, survey_id, brands_hint=brands)
            self._survey_data_cache[survey_id] = survey_data
            
        if survey_data.response_count == 0:
            return {"charts": [], "base_n": 0}
            
        sliced_data = survey_data.slice(filters)
        
        survey_doc = await self.db.surveys.find_one({"_id": ObjectId(survey_id)})
        my_brand = survey_doc.get("customizations", {}).get("my_brand") if survey_doc else (sliced_data.brands[0] if sliced_data.brands else "Brand")
        group_by_field = filters.get("group_by")
        blueprint = survey_doc.get("blueprint") if survey_doc else None
        
        # Build filtered attribute registry from DB (library + custom)
        attribute_registry = await self.get_attribute_registry(survey_doc) if survey_doc else []
        
        research_type = survey_doc.get("type", "standard") if survey_doc else "standard"
        
        aggregator = ReportAggregator(
            data=sliced_data, 
            my_brand=my_brand, 
            group_by=group_by_field, 
            blueprint=blueprint, 
            attribute_registry=attribute_registry,
            research_type=research_type
        )
        charts = aggregator.compute_all()
        
        # Merge partial new state over existing DB state for the frontend (just base_n & charts)
        return {
            "survey_id": survey_id,
            "base_n": sliced_data.response_count,
            "charts": charts,
            "purchase_funnel_brands": sliced_data.purchase_funnel_brands,
            "telemetry": {
                "pipeline": "v2_slicer",
                "eval_count": len(sliced_data.evaluations),
                "chart_count": len(charts),
                "brands_discovered": sliced_data.brands,
            }
        }

    async def _run_analysis_task(self, survey_id: str, options: Dict[str, Any], force: bool = False):
        """
        === NEW PIPELINE (Phase C) ===
        3-hop flow: DirectIngestor → ReportAggregator → MongoDB
        
        The old pipeline is preserved as an optional PPTX export path
        but is no longer required for the web dashboard.
        """
        survey_oid = ObjectId(survey_id)
        logger.info(f"[NEW PIPELINE] Background analysis started for survey {survey_id}")
        
        try:
            # ── Step 1: Fetch survey config ──
            survey_doc = await self.db.surveys.find_one({"_id": survey_oid})
            if not survey_doc:
                raise ValueError(f"Survey {survey_id} not found")
            
            customs = survey_doc.get("customizations", {})
            brands = customs.get("brands", [])
            my_brand = customs.get("my_brand") or (brands[0] if brands else "Brand")
            project_name = survey_doc.get("company_name", "Survey Analysis")
            research_type = survey_doc.get("type", "standard")

            # ── Step 2: Ingest data (THE NEW WAY — 1 hop) ──
            from backend.analytics_module.ingestor import DirectIngestor
            from backend.analytics_module.aggregator import ReportAggregator

            start_time = datetime.utcnow()
            
            survey_data = await DirectIngestor.load(
                self.db, survey_id, brands_hint=brands
            )

            logger.info(
                "[NEW PIPELINE] Ingested %d responses, %d evals, %d brands",
                survey_data.response_count,
                len(survey_data.evaluations),
                len(survey_data.brands),
            )

            if survey_data.response_count == 0:
                raise ValueError(f"No responses found for survey {survey_id}")

            survey_context = SurveyContextBlock.from_survey_doc(
                survey_doc,
                my_brand=my_brand,
                base_n=survey_data.response_count,
                brands=brands,
            )

            # Use discovered brands if survey config had none
            if not brands and survey_data.brands:
                brands = survey_data.brands
                my_brand = brands[0]

            # ── Step 3: Compute all charts (THE NEW WAY — 1 hop) ──
            blueprint = survey_doc.get_blueprint() if hasattr(survey_doc, "get_blueprint") else survey_doc.get("blueprint")
            if isinstance(blueprint, dict) and "category" not in blueprint:
                # Handle model vs dict
                pass

            # Build filtered attribute registry from DB (library + custom)
            attribute_registry = await self.get_attribute_registry(survey_doc)
            
            aggregator = ReportAggregator(
                data=survey_data,
                my_brand=my_brand,
                blueprint=blueprint,
                attribute_registry=attribute_registry,
                research_type=research_type,
            )
            charts = aggregator.compute_all()
            available_filters = aggregator.get_available_filters()

            # ── Step 3.5: Inject AI Insights (Phase 4) ──
            app_config = load_app_config()
            insight_cache_coll = self.db.get_collection("ai_insight_cache")
            cache_mgr = InsightCacheManager(insight_cache_coll)
            if force:
                await cache_mgr.invalidate_survey(survey_id)
            
            # Quota & Alerting logic
            qm = QuotaMonitor(self.db)
            AIGuard.quota_monitor = qm
            api_cost.reset()

            # Initialize Model Router for background jobs
            router = ModelRouter(base_model=app_config.model)
            telemetry_data = {"model_routing": router.get_routing_summary()}

            chart_engine = None
            if app_config.openai_api_key:
                chart_engine = ChartInsightEngine(
                    client=app_config.client,
                    model=router.resolve("chart_insights"),
                    my_brand=my_brand,
                    research_type=research_type,
                    cache_manager=cache_mgr,
                    survey_id=survey_id,
                    survey_context=survey_context,
                )

            # Parallelize Chart Insights
            if chart_engine:
                from backend.models import ChartPayload
                tasks = []
                chart_objects = []
                for c_dict in charts:
                    # Convert to model for compatibility
                    c_payload = ChartPayload(**c_dict)
                    chart_objects.append(c_payload)
                    tasks.append(chart_engine.generate(c_payload, section_name="Executive Summary"))
                
                if tasks:
                    ai_results = await asyncio.gather(*tasks, return_exceptions=True)
                    for i, res in enumerate(ai_results):
                        if isinstance(res, Exception):
                            logger.error(f"AI Task {i} failed with exception: {res}")
                            continue
                        
                        if isinstance(res, tuple) and len(res) == 2:
                            headline, deep = res
                            chart_objects[i].ai_headline = headline
                            chart_objects[i].ai_deep_analysis = deep
                        else:
                            logger.warning(f"AI Task {i} returned unexpected type {type(res)}: {res}")
                
                    # Update charts list with AI-enriched dicts
                    charts = [c.model_dump() for c in chart_objects]
                    
                    enriched_count = sum(1 for c in charts if c.get("ai_headline"))
                    logger.info(f"[TELEMETRY] AI enrichment complete. {enriched_count}/{len(charts)} charts have headlines.")

            # ── Step 3.6: Enhanced Verbatim Analysis ──
            if chart_engine and survey_data.response_count > 0:
                try:
                    # Fetch raw responses for VerbatimAnalyzer (wide format resolution)
                    cursor = self.db.responses.find({"survey_id": survey_id})
                    raw_resps = await cursor.to_list(length=5000)
                    df_responses = pd.DataFrame([
                        {**r.get("answers", {}), "_id": str(r["_id"])} for r in raw_resps
                    ])
                    
                    # project_inputs resolution
                    from backend.analytics_module.project_inputs_setter import build_project_inputs_from_form
                    project_inputs = build_project_inputs_from_form({
                        **survey_doc.get("analytical_mapping", {}),
                        "brands": brands,
                        "my_brand": my_brand
                    })

                    v_analyzer = VerbatimAnalyzer(
                        client=app_config.client,
                        model=router.resolve("verbatim"),
                        cache_manager=cache_mgr,
                        survey_id=survey_id,
                        survey_context=survey_context,
                    )
                    
                    v_results = await v_analyzer.run_all(df_responses, project_inputs, brands)
                    
                    if v_results:
                        from backend.analytics_module.web_serializer import WebReportSerializer
                        class MockConcept:
                            def __init__(self, slide_id, section, template_slide_title, comparator=None):
                                self.slide_id = slide_id
                                self.section = section
                                self.template_slide_title = template_slide_title
                                self.comparator = comparator
                        
                        concept_mock = MockConcept("verbatim_ai", "Verbatim Analysis", "Verbatim", comparator=brands)
                        v_charts = WebReportSerializer._serialize_verbatim_analysis(concept_mock, v_results)
                        for vc in v_charts:
                            charts.append(vc.model_dump())
                            
                except Exception as e:
                    logger.error("Failed executing enhanced Verbatim Analysis in Background: %s", e)

            # Metadata for telemetry
            chart_ids = [c.get("chart_id") for c in charts if isinstance(c, dict)]
            has_brand_awareness = "brand_awareness" in chart_ids
            has_purchase_funnel_headline_line = "purchase_funnel_headline_line" in chart_ids
            has_purchase_funnel_ratio_cards = "purchase_funnel_ratio_cards" in chart_ids

            # ── Step 3.6.5: Brand Analyzer Excel Export (L7 Special) ──
            ba_excel_path = None
            if research_type == "brand_analyzer" or "brand_analyzer_cbi" in [c.get("chart_id") for c in charts]:
                try:
                    from backend.analytics_module.src.BrandAnalyzer.exporter import BrandAnalyzerExcelExporter
                    ctx = aggregator.prepare_ba_matrices()
                    if ctx:
                        reports_dir = Path("backend/reports")
                        reports_dir.mkdir(parents=True, exist_ok=True)
                        filename = f"BA_Analysis_{survey_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
                        ba_excel_path = str(reports_dir / filename)
                        BrandAnalyzerExcelExporter.generate_excel(ctx, ba_excel_path)
                        logger.info(f"[BRAND ANALYZER] Excel report generated at {ba_excel_path}")
                except Exception as e:
                    logger.error(f"[BRAND ANALYZER] Failed to generate Excel report: {e}", exc_info=True)

            # ── Step 3.7: Aggregate Report-Level Insights ──
            report_insights = ReportInsights(executive_summary=f"Analysis of {survey_data.response_count} respondents across {len(brands)} brands.")
            if chart_engine:
                try:
                    aggregator_ai = InsightAggregator(
                        openai_api_key=app_config.openai_api_key,
                        model=router.resolve("executive_summary"),
                        client=app_config.client
                    )
                    # Use chart insights as history for summary
                    history = []
                    for c in charts:
                        if c.get("ai_headline"):
                            history.append({
                                "slide_id": c.get("chart_id"),
                                "insight": c.get("ai_headline")
                            })
                    
                    if history:
                        report_insights = await aggregator_ai.aggregate(
                            history,
                            brands,
                            survey_context=survey_context,
                        )

                    # ── Key Finding contract enforcement ──
                    # The prompt asks for a finding bound to the business
                    # question and the measured attributes; this guarantees it.
                    # A violating summary is replaced with a deterministic
                    # sentence read straight off the computed charts, so the
                    # most-read line in the report can never reference a
                    # dimension the survey did not measure.
                    try:
                        from backend.analytics_module.src.ai.key_finding_guard import (
                            enforce_key_finding,
                        )

                        enforced, verdict = enforce_key_finding(
                            report_insights.executive_summary,
                            target_brand=my_brand or (brands[0] if brands else ""),
                            charts=charts,
                            measured_attributes=getattr(survey_context, "measured_attributes", None),
                            modules_used=getattr(survey_context, "modules_used", None),
                            survey_objective=getattr(survey_context, "survey_objective", ""),
                        )
                        if not verdict.ok:
                            logger.warning(
                                "[KeyFinding] Contract violated for survey %s: %s",
                                survey_id, " | ".join(verdict.reasons),
                            )
                        report_insights.executive_summary = enforced
                    except Exception as guard_err:
                        logger.error(
                            "[KeyFinding] Guard failed, keeping generated summary: %s",
                            guard_err, exc_info=True,
                        )

                    # ── Step 3.8: Opportunity Intelligence Engine ──
                    # Fusing quantitative signals with qualitative proof for priority focus
                    if my_brand and df_responses is not None and not df_responses.empty:
                        try:
                            # 1. Deterministic Detection (Gap + PI Sigma Analysis)
                            detector = OpportunityDetector(survey_data, project_inputs)
                            raw_signals = aggregator.opportunity_signals()
                            top_opts = detector.detect(raw_signals)
                            logger.info(f"Opportunity Detector found {len(top_opts)} candidates for '{my_brand}'.")
                            
                            if top_opts:
                                # 2. NLP Alignment (Grounding verbatims to attributes)
                                nlp_analyzer = OpportunityNLPAnalyzer()
                                global_feedback = nlp_analyzer.extract_feedback(df_responses, my_brand, project_inputs)
                                alignment_map = nlp_analyzer.map_feedback_to_attributes(global_feedback, [o["attribute"] for o in top_opts])
                                packages = nlp_analyzer.build_packages(top_opts, alignment_map, global_feedback)
                                
                                # 3. LLM Synthesis (Structured Narration)
                                synthesizer = OpportunitySynthesizer(
                                    client=app_config.client,
                                    model=router.resolve("executive_summary"),
                                    cache_manager=cache_mgr,
                                    survey_id=survey_id
                                )
                                opp_insights = await synthesizer.synthesize(
                                    packages,
                                    brand_name=my_brand,
                                    category=project_inputs.get("category", "General"),
                                    sample_n=survey_data.response_count,
                                    testing_protocol=survey_context.testing_protocol,
                                )
                                if opp_insights:
                                    report_insights.opportunity_insights = opp_insights
                                    logger.info(f"Successfully injected {len(opp_insights)} priority opportunities into report.")
                                    
                        except Exception as opp_err:
                            logger.error(f"Opportunity Intelligence Engine failed: {opp_err}", exc_info=True)
                except Exception as e:
                    logger.error("Failed to aggregate executive insights: %s", e)

            # ── Step 4: Build executive summary ──
            # (Already done in Step 3.7)

            # ── Step 5: Persist to MongoDB (THE NEW WAY — 1 hop) ──
            duration = (datetime.utcnow() - start_time).total_seconds()
            report_doc = {
                "survey_id": survey_id,
                "status": "ready",
                "project_name": project_name,
                "research_type": research_type,
                "brands": brands,
                "brand_list": brands,  # Backward compat
                "purchase_funnel_brands": survey_data.purchase_funnel_brands,
                "base_n": survey_data.response_count,
                "total_responses": survey_data.response_count,
                "charts": charts,
                "available_filters": available_filters,
                "sections": [{"section_id": "legacy_compat", "section_name": "Full Analysis", "charts": charts}],  # Backward compat for production frontend
                "insights": report_insights.model_dump(),
                # Which prompt contract produced this narrative. If this does
                # not change after a prompt edit, the worker is running stale code.
                "ai_contract_version": _ai_contract_version(),
                "telemetry": {
                    "pipeline": "v2_direct_ai",
                    "duration_s": round((datetime.utcnow() - start_time).total_seconds(), 2),
                    "eval_count": len(survey_data.evaluations),
                    "chart_count": len(charts),
                    "brands_discovered": brands,
                    "has_brand_awareness": has_brand_awareness,
                    "has_purchase_funnel_headline_line": has_purchase_funnel_headline_line,
                    "has_purchase_funnel_ratio_cards": has_purchase_funnel_ratio_cards,
                    "ai_cost_manifest": api_cost.get_summary(),
                    **telemetry_data
                },
                "ai_cost_manifest": api_cost.get_summary(),
                "generated_at": start_time,
                "generation_duration_s": round(duration, 2),
                "error_message": None,
                "pptx_path": None,  # PPTX is now a separate export step
                "brand_analyzer_excel_path": ba_excel_path,
            }

            await self.db.get_collection("survey_reports").update_one(
                {"survey_id": survey_id},
                {"$set": report_doc},
                upsert=True,
            )

            persisted_report = await self.db.get_collection("survey_reports").find_one(
                {"survey_id": survey_id},
                sort=[("generated_at", -1)],
            )

            # ── Step 6: Post-Processing & Artifact Generation (Systematic Task 3) ──
            await self._run_pptx_rebuild_task(survey_id, persisted_report or report_doc)

            # Update survey status
            await self.db.surveys.update_one(
                {"_id": survey_oid},
                {"$set": {
                    "report_status": "completed",
                    "quality_status": self._validate_quality_v2(survey_data),
                }}
            )

            logger.info(f"[NEW PIPELINE] Report ready for survey {survey_id}")

        except asyncio.TimeoutError:
            logger.error(f"Analysis timed out for survey {survey_id}")
            await self._fail_report(survey_id, survey_oid, "Report generation timed out after 5 minutes.")

        except Exception as e:
            stack_trace = traceback.format_exc()
            logger.error(f"Analysis failed for survey {survey_id}:\n{stack_trace}")
            await self._fail_report(survey_id, survey_oid, str(e))

    async def _fail_report(self, survey_id: str, survey_oid, error_msg: str):
        """Unified failure handler."""
        await self.db.surveys.update_one(
            {"_id": survey_oid},
            {"$set": {"report_status": "failed", "report_error": error_msg}}
        )
        await self.db.get_collection("survey_reports").update_one(
            {"survey_id": survey_id},
            {"$set": {
                "status": "failed",
                "error_message": error_msg,
                "updated_at": datetime.utcnow(),
            }},
            upsert=True,
        )

    def _validate_quality_v2(self, data) -> Dict[str, Any]:
        """Quality validation using SurveyData."""
        reasons = []
        flagged = False

        if data.response_count < 30:
            reasons.append(f"Low response count ({data.response_count} < 30)")
            flagged = True
        
        if data.evaluations.empty:
            reasons.append("No evaluation data found")
            flagged = True

        return {
            "flagged": flagged,
            "reason": "; ".join(reasons) if reasons else "Good",
            "score": 100 if not flagged else 50,
        }


    def _validate_quality(self, df: Any) -> Dict[str, Any]:
        """Built-in validation logic to flag poor data quality."""
        reason = []
        flagged = False
        
        if len(df) < 30: # Minimum significance threshold
            reason.append("Low response count (< 30)")
            flagged = True
            
        # Add more logic here (e.g. straight-lining detection, speeders)
        
        return {
            "flagged": flagged,
            "reason": "; ".join(reason) if reason else "Good",
            "score": 100 if not flagged else 50
        }

    async def poll_openai_batches(self):
        """
        Background poller for OpenAI batches. 
        Checks for completion and triggers report finalization.
        """
        cursor = self.db.survey_reports.find({"status": "awaiting_batch"})
        async for report in cursor:
            batch_id = report.get("ai_batch_id")
            survey_id = report.get("survey_id")
            if not batch_id: continue

            try:
                from backend.analytics_module.config_loader import load_app_config
                survey_doc = await self.db.surveys.find_one({"_id": ObjectId(survey_id)})
                app_config = load_app_config(survey_doc)
                
                batch = app_config.client.batches.retrieve(batch_id)
                
                if batch.status == "completed":
                    logger.info(f"[BatchPoller] Batch {batch_id} completed for survey {survey_id}")
                    await self._finalize_batch_report(report, batch, app_config)
                elif batch.status in ["failed", "expired", "cancelled"]:
                    logger.error(f"[BatchPoller] Batch {batch_id} failed: {batch.status}")
                    await self.db.survey_reports.update_one(
                        {"_id": report["_id"]},
                        {"$set": {"status": "failed", "error_message": f"AI Batch failed: {batch.status}"}}
                    )
            except Exception as e:
                logger.error(f"[BatchPoller] Error checking batch {batch_id}: {e}")

    async def _finalize_batch_report(self, report: dict, batch: Any, app_config: Any):
        """Downloads batch results and runs final synthesis."""
        survey_id = report["survey_id"]
        file_response = app_config.client.files.content(batch.output_file_id)
        
        batch_results = {}
        for line in file_response.text.strip().split('\n'):
            res_obj = json.loads(line)
            custom_id = res_obj.get("custom_id")
            content = res_obj.get("response", {}).get("body", {}).get("choices", [{}])[0].get("message", {}).get("content")
            if content: batch_results[custom_id] = json.loads(content)

        sections = report.get("sections", [])
        for section in sections:
            for chart in section.get("charts", []):
                lookup_id = f"{survey_id}|chart_{chart.get('chart_id')}"
                if lookup_id in batch_results:
                    res = batch_results[lookup_id]
                    chart["ai_headline"] = res.get("headline", "")
                    chart["ai_deep_analysis"] = res.get("analysis_points", [])

        partial_context_dict = report.get("partial_context", {})
        context = ReportDataContext(**partial_context_dict)

        survey_context = None
        raw_ctx = partial_context_dict.get("metadata", {}).get("survey_context")
        if isinstance(raw_ctx, dict) and raw_ctx:
            survey_context = SurveyContextBlock(**raw_ctx)
        
        from backend.analytics_module.src.ai.model_router import ModelRouter
        router = ModelRouter(base_model=app_config.model)
        aggregator = InsightAggregator(app_config.openai_api_key, model=router.resolve("executive_summary"), client=app_config.client)
        insights = await aggregator.aggregate(
            context,
            research_type=partial_context_dict.get("metadata", {}).get("research_type", "Standard"),
            survey_context=survey_context,
        )
        
        # Batch finalisation writes insights on a different path from the
        # synchronous generator, so the Key Finding contract has to be applied
        # here too or batch-mode reports silently skip enforcement.
        try:
            from backend.analytics_module.src.ai.key_finding_guard import enforce_key_finding

            enforced, verdict = enforce_key_finding(
                insights.executive_summary,
                target_brand=getattr(survey_context, "target_brand", "") or "",
                charts=report.get("charts") or [],
                measured_attributes=getattr(survey_context, "measured_attributes", None),
                modules_used=getattr(survey_context, "modules_used", None),
                survey_objective=getattr(survey_context, "survey_objective", ""),
            )
            if not verdict.ok:
                logger.warning(
                    "[KeyFinding] Contract violated in batch finalisation for %s: %s",
                    report.get("survey_id"), " | ".join(verdict.reasons),
                )
            insights.executive_summary = enforced
        except Exception as guard_err:
            logger.error("[KeyFinding] Batch guard failed: %s", guard_err, exc_info=True)

        await self.db.survey_reports.update_one(
            {"_id": report["_id"]},
            {
                "$set": {
                    "status": "ready",
                    "sections": sections,
                    "insights": insights.model_dump(),
                    "ai_contract_version": _ai_contract_version(),
                    "generated_at": datetime.utcnow(),
                },
                "$unset": {"partial_context": "", "ai_batch_id": ""}
            }
        )

    async def get_usage_stats(self, survey_id: str = None) -> Dict[str, Any]:
        """Aggregate usage stats for the dashboard."""
        query = {}
        if survey_id:
            query["survey_id"] = ObjectId(survey_id)
            
        cursor = self.db.usage_logs.find(query)
        logs = await cursor.to_list(length=100)
        
        total_cost = sum(log["usage"]["total_cost_usd"] for log in logs)
        total_tokens = sum(log["usage"]["total_tokens"] for log in logs)
        
        return {
            "total_cost_usd": round(total_cost, 4),
            "total_tokens": total_tokens,
            "reports_generated": len(logs)
        }

    async def get_ai_quota_status(self) -> Dict[str, Any]:
        """Admin-only: Aggregates live AI cost and performance metrics across the platform."""
        cache_col = self.db["ai_insight_cache"]
        
        # 1. Platform-wide Cost Aggregation
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_cost": {"$sum": "$cost_usd"},
                    "total_tokens": {"$sum": {"$add": ["$token_metrics.prompt_tokens", "$token_metrics.completion_tokens"]}},
                    "prompt_tokens": {"$sum": "$token_metrics.prompt_tokens"},
                    "completion_tokens": {"$sum": "$token_metrics.completion_tokens"},
                    "entry_count": {"$sum": 1}
                }
            }
        ]
        agg_result = await cache_col.aggregate(pipeline).to_list(1)
        stats = agg_result[0] if agg_result else {
            "total_cost": 0, "total_tokens": 0, "prompt_tokens": 0, "completion_tokens": 0, "entry_count": 0
        }

        # 2. Per-Survey Cost Leaderboard
        leaderboard_pipeline = [
            {"$group": {"_id": "$survey_id", "cost": {"$sum": "$cost_usd"}}},
            {"$sort": {"cost": -1}},
            {"$limit": 5}
        ]
        leaderboard = await cache_col.aggregate(leaderboard_pipeline).to_list(5)
        
        # 3. Component Breakdown (Insights vs recommendations vs verbatims)
        component_pipeline = [
            {"$group": {"_id": "$component_type", "cost": {"$sum": "$cost_usd"}, "calls": {"$sum": 1}}},
            {"$sort": {"cost": -1}}
        ]
        components = await cache_col.aggregate(component_pipeline).to_list(10)

        return {
            "summary": {
                "total_cost_usd": round(stats.get("total_cost", 0), 4),
                "total_tokens": stats.get("total_tokens", 0),
                "prompt_tokens": stats.get("prompt_tokens", 0),
                "completion_tokens": stats.get("completion_tokens", 0),
                "cache_entries": stats.get("entry_count", 0)
            },
            "leaderboard": leaderboard,
            "component_mix": components,
            "status": "Healthy" if stats.get("total_cost", 0) < 500 else "Warning" # Example threshold
        }

    async def get_ai_alerts(self) -> List[Dict[str, Any]]:
        """Admin-only: Retrieve all unresolved API quota and rate-limit alerts."""
        from backend.analytics_module.src.ai.quota_monitor import QuotaMonitor
        qm = QuotaMonitor(self.db)
        return await qm.get_active_alerts()

    async def acknowledge_ai_alert(self, alert_id: str, admin_id: str) -> bool:
        """Mark a specific AI alert as acknowledged."""
        from backend.analytics_module.src.ai.quota_monitor import QuotaMonitor
        qm = QuotaMonitor(self.db)
        return await qm.acknowledge_alert(alert_id, admin_id)

# Global instance for easy access in routers
analytics_service = AnalyticsService()
