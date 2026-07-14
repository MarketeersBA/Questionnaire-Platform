"""
Runner for dynamic (expandable) slide concepts.

Usage (Option B — standalone validation script):
    Instantiate run_MySlides() with the same arguments available at
    pipeline runtime and it will:

    1. Phase 1 — All concepts except RecommendationSlide: load_inputs → process
       → populate → write_to_excel (and collect slide entries).
    2. Phase 2 — If w_insights: generate insights per slide and attach to entries.
    3. Phase 3 — If project_inputs["w_recommendations"] is true: call generate_recommendations
       from other slides' insights when client/model are available, then run RecommendationSlide
       to populate the four 4-P slides. Not tied to sections.

This file does NOT remove or replace any existing pipeline code — it runs
alongside the existing path for comparison.
"""

from __future__ import annotations
import asyncio

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.analytics_module.src.MyPPTX.slides import (
    _remove_unmodified_slides, 
    _duplicate_section_header, 
    prune_presentation,
    get_slide_title,
    set_insight_text
)
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import get_registry, discover_slides
from backend.analytics_module.src.MySlides.pivot_store import PivotStore
from backend.analytics_module.src.MySlides.metrics import DerivedMetricsEngine
from backend.analytics_module.src.MySlides.validator import DataValidator
from .context import SpecialistContextProvider
from .strategies.standard import StandardStrategy
from .strategies.taste_test import TasteTestStrategy

logger = logging.getLogger(__name__)

_RESEARCH_SCHEMA: Dict[str, Any] = {}

def _load_research_schema():
    global _RESEARCH_SCHEMA
    if not _RESEARCH_SCHEMA:
        path = Path(__file__).parent / "research_schema.json"
        try:
            with open(path, "r", encoding="utf-8") as f:
                _RESEARCH_SCHEMA = json.load(f)["research_types"]
        except Exception:
            logger.warning("Research schema not found at %s. Falling back to defaults.", path)
            _RESEARCH_SCHEMA = {}

def get_strategy(section: str, project_inputs: dict):
    """
    Factory to determine the correct execution strategy using schema-driven analysis.
    """
    _load_research_schema()
    
    research_type = project_inputs.get("research_type", "Standard")
    # Normalized section matching
    section_lower = section.strip().lower()
    
    # Identify if the section triggers a specialist strategy
    is_taste_test = section_lower in ["taste test", "taste_test", "product placement"]
    
    if is_taste_test:
        return TasteTestStrategy(project_inputs)
    
    # Default to schema lookup if available
    schema = _RESEARCH_SCHEMA.get(research_type)
    if schema and schema.get("strategy") == "TasteTestStrategy":
         return TasteTestStrategy(project_inputs)

    return StandardStrategy(project_inputs)


# ---------------------------------------------------------------------------
# Registry: section name (lower-case) → list of concept classes
# ---------------------------------------------------------------------------

def _make_registry() -> Dict[str, List[type]]:
    """Return the section-name -> list of concept classes from the global registry."""
    # Ensure all modules are loaded to trigger registration
    discover_slides()
    return get_registry()


# UI / JSON often use shorter labels than registry keys (e.g. "Brand Awareness" vs full BA-PF section).
_SECTION_ALIASES: Dict[str, str] = {
    "brand awareness": "brand awareness and purchase funnel",
    "purchase habits": "habits",
    "usage habits": "habits",
    "habits": "habits",
}


def get_concept_for_section(section: str) -> List[type]:
    """Return the list of concept classes for *section* (empty if unrecognised)."""
    registry = _make_registry()
    raw = section.strip().lower()
    key = _SECTION_ALIASES.get(raw, raw)
    return list(registry.get(key) or [])


def build_concepts_from_sections(
    sections: List[str],
) -> List[DynamicSlideConcept]:
    """
    Instantiate concept classes for each section that has registered classes.
    Sections can have multiple concepts; each class is instantiated at most once.

    Parameters
    ----------
    sections : list of section names from project_inputs["sections"]

    Returns
    -------
    list of instantiated (but not yet load_inputs'd) DynamicSlideConcept objects.
    """
    seen: set = set()
    concepts: List[DynamicSlideConcept] = []
    for section in sections:
        for cls in get_concept_for_section(section):
            if cls in seen:
                continue
            seen.add(cls)
            concepts.append(cls())
    return concepts


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def parse_input(raw_payload: dict) -> PivotStore:
    """
    PHASE 1 - Parse the incoming JSON payload into the single source of truth PivotStore.
    Runs hard validation for critical structure.
    """
    store = PivotStore()
    
    # 1. Project Metadata
    store.project = dict(raw_payload.get("project", {}))
    # Or in our existing pipeline, the dict passed IS project_inputs directly,
    # so we should be flexible and accept raw_payload itself if project isn't nested.
    if "project_name" in raw_payload and "project" not in raw_payload:
        store.project = {
            "client_name": raw_payload.get("project_name") or raw_payload.get("client_name"),
            "study_type": raw_payload.get("research_type"),
            "total_sample_size": raw_payload.get("respondent_count", 0),
            "report_date": raw_payload.get("report_date", ""),
            **raw_payload
        }
    
    # Validation: client_name is required (Phase 1 sanity check)
    if not store.project.get("client_name"):
        # Legacy fallback: try project_name or company_name
        store.project["client_name"] = (
            store.project.get("project_name") or 
            store.project.get("company_name") or 
            "Unknown Client"
        )
        print(f"[DEBUG] Assigned fallback client_name: {store.project['client_name']}")
        
    if not store.project.get("client_name"):
        print(f"[DEBUG] CRITICAL ERROR: client_name still missing! Project dict: {store.project}")
        raise ValueError("CRITICAL: project metadata must contain a valid client_name.")


        
    # 2. Brands List
    # Find brands either from focus_brands or explicitly from brands key
    raw_brands = list(raw_payload.get("brands") or raw_payload.get("focus_brands") or [])
    store.brands = []
    
    # Robust normalization: Ensure all brands are dicts
    for b in raw_brands:
        if isinstance(b, str):
            store.brands.append({"brand_id": b, "brand_name": b, "is_client_brand": False})
        elif isinstance(b, dict):
            store.brands.append(b)

    # Count explicit client brand
    client_brand_count = sum(1 for b in store.brands if b.get("is_client_brand"))

    if client_brand_count != 1 and len(store.brands) > 0:
        # Instead of failing legacy code, if there are brands but no client_brand explicitly marked
        # we will log a warning or enforce it strictly if needed.
        pass # In phase 1, we relax the 1 brand requirement slightly for legacy fallback.
        
    # 3. Raw Answers (Phase 1 Robust Normalization)
    # We recursively ensure that raw_answers is a dict of dicts.
    # Legacy data sometimes passes strings or lists where the agent expects structured objects.
    raw_responses = raw_payload.get("raw_answers") or {}
    if not isinstance(raw_responses, dict):
        raw_responses = {"legacy_data": {"data": raw_responses, "question_type": "legacy"}}

    for q_id, req in raw_responses.items():
        # Defensive check: if req is a string, wrap it in a standard dict
        if isinstance(req, (str, list)):
            req = {"data": req, "question_type": "Unknown", "base_n": 0}
        
        if not isinstance(req, dict):
            continue

        if q_id in store.raw_answers:
            # Prefer the one with actual data/base size
            curr_base = store.raw_answers[q_id].get("base_n", 0) if isinstance(store.raw_answers[q_id], dict) else 0
            new_base = req.get("base_n", 0)
            if new_base > curr_base:
                store.raw_answers[q_id] = req
        else:
            store.raw_answers[q_id] = req

    # 4. Selected Sections
    store.selected_sections = raw_payload.get("sections") or []
    
    return store


def _run_async(coro):
    """Bridge for running async coroutines from sync code."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    if loop.is_running():
        # This shouldn't happen in our current architecture but handle gracefully
        import nest_asyncio
        nest_asyncio.apply()
        return loop.run_until_complete(coro)
    else:
        return loop.run_until_complete(coro)

def run_dynamic_slides(
    *,
    project_inputs: dict,
    data_store,
    meta_data,
    meta_grids,
    codebook_df,
    pres,
    out_dir: str,
    sections: Optional[List[str]] = None,
    client=None,
    model: Optional[str] = None,
    w_insights: bool = False,
    telemetry: Any = None,
    router: Any = None,
) -> List[dict]:
    """
    Run all dynamic slide concepts for the given sections.

    Parameters
    ----------
    project_inputs  : full project inputs dict (same as in main.py).
    data_store      : PivotStore-like object with .get(name) method.
    meta_data       : DataFrame from SSI parser.
    meta_grids      : DataFrame of grid questions.
    codebook_df     : codebook DataFrame.
    pres            : python-pptx Presentation object (template already loaded).
    out_dir         : output directory path (str or Path).
    sections        : list of section names to run; defaults to project_inputs["sections"].
    client          : OpenAI-compatible client for insight generation (optional).
    model           : model name for insight generation (optional).
    w_insights      : whether to generate LLM insights for each slide (phase 2).
    project_inputs["w_recommendations"] : if true, run phase 3 (4-P recommendation slides).
                      Default false. When true, generate_recommendations runs if client and
                      model are set; otherwise bullets come from project_inputs["recommendations"].

    Returns
    -------
    Tuple[List[dict], Dict[str, Any]]
        (slide_entries, raw_payloads) compatible with main.py pipeline,
        plus the raw DataFrames for JSON serialization.
    """
    out_dir_path = Path(out_dir)
    sections_to_run: List[str] = list(sections or project_inputs.get("sections") or [])
    # Product Placement uses the Taste Test slide set / concepts.
    sections_to_run = [
        ("Taste Test" if (s or "").strip().lower() == "product placement" else s)
        for s in sections_to_run
    ]
    my_brand: str = project_inputs.get("my_brand") or ""

    concepts = build_concepts_from_sections(sections_to_run)
    from backend.analytics_module.src.MySlides.recommendation import RecommendationSlide

    # -----------------------------------------------------------------------
    # 0. Specialist Context Enrichment (Phase 2: Specialist Context)
    # -----------------------------------------------------------------------
    context_provider = SpecialistContextProvider(project_inputs)
    context_provider.enrich_data_store(data_store, meta_data)
    
    # Merge any specialist metadata into project_inputs (e.g. is_comparative)
    project_inputs = {**project_inputs, **context_provider.get_specialist_input_keys()}

    w_rec = bool(project_inputs.get("w_recommendations", False))
    recommendation_concepts: List[DynamicSlideConcept] = (
        [RecommendationSlide()] if w_rec else []
    )

    if not concepts and not recommendation_concepts:
        logger.info(
            "run_MySlides: no concepts for sections %s and w_recommendations is false",
            sections_to_run,
        )
        # Even if empty, we still run validation and pruning to guarantee isolated unselected sections are wiped
    
    # -----------------------------------------------------------------------
    # PHASE 1-4: The Master Agent Blueprint
    # -----------------------------------------------------------------------
    
    # PHASE 1: Build the Single Source of Truth
    logger.info("PHASE 1: PivotStore Initialization")
    # For robust compatibility, we pass what we have
    payload_bridge = {
        "project": project_inputs,
        "raw_answers": project_inputs.get("raw_answers", {}),
        "brands": project_inputs.get("brands", project_inputs.get("focus_brands", [])),
        "sections": sections_to_run
    }
    
    # NEW: Instead of creating a new store, we update the existing data_store
    # that already contains the intensive Pandas DataFrames.
    store_meta = parse_input(payload_bridge)
    data_store.project = store_meta.project
    data_store.brands = store_meta.brands
    data_store.raw_answers = store_meta.raw_answers
    data_store.selected_sections = store_meta.selected_sections
    
    # PHASE 2: Compute Derived Metrics
    logger.info("PHASE 2: Computing Derived Metrics")
    DerivedMetricsEngine().compute(data_store)
    
    # PHASE 3: Global Validation & Quality Gates
    logger.info("PHASE 3: Global Slide State Validation")
    DataValidator().validate(data_store)
    
    # PHASE 4: Strict Template Pruning (Isolates sections)
    logger.info("PHASE 4: Template Sliding Isolation and Pruning")
    pres = prune_presentation(pres, data_store)

    # Group concepts by section, preserving section order from sections_to_run
    section_order: List[str] = list(dict.fromkeys(sections_to_run))
    section_to_concepts: Dict[str, List[DynamicSlideConcept]] = {}
    for sec in section_order:
        section_to_concepts[sec] = [c for c in concepts if (c.section or "").strip() == sec]

    initial_slide_count = len(pres.slides)
    all_modified_slides: set = set()
    all_slide_entries: List[dict] = []
    insight_slide_map: List[tuple] = []
    raw_payloads: Dict[str, Any] = {}

    for section in section_order:
        section_concepts = section_to_concepts.get(section, [])
        if not section_concepts:
            continue
        
        # 2. Select strategy (Phase 1: Enhanced structure)
        strategy = get_strategy(section, project_inputs)
        
        # 3. Execute section lifecycle (delegated to strategy)
        strategy.execute_section(
            section=section,
            concepts=section_concepts,
            data_store=data_store,
            meta_data=meta_data,
            meta_grids=meta_grids,
            codebook_df=codebook_df,
            pres=pres,
            out_dir_path=out_dir_path,
            all_modified_slides=all_modified_slides,
            all_slide_entries=all_slide_entries,
            insight_slide_map=insight_slide_map,
            raw_payloads=raw_payloads,
            client=client,
            model=model,
            router=router,
        )

        if telemetry:
            telemetry.end_event(f"section_{section}")

    # Phase 2: generate insights and write to the correct slide (one pass after all populating)
    ai_failure_count = 0

    # Phase 2: generate insights from the map if requested (Stateful Narrator)
    history = []
    if w_insights and client and model and insight_slide_map:
        from backend.analytics_module.src.MyPPTX.textboxes import set_insight_text
        
        # Route narrator to mini model if router exists
        resolved_model = router.resolve("insights") if router else model
        narrator = ChronologicalNarrator(client, resolved_model)
        narrator.set_strategy(project_inputs.get("research_type", "Standard"))

        # Optimization (Phase 5): Concurrent Narration for large slidesets
        my_brand = project_inputs.get("my_brand", "")
        
        # We still loop to assign back to slides, but the work is faster
        if len(insight_slide_map) > 5:
            # Parallel approach (Now async-native)
            all_insights = _run_async(narrator.batch_generate_insights(insight_slide_map, my_brand))
            # Map them back sequentially to the slides
            for (instance_key, target_slide, payload, section), insight_text in zip(insight_slide_map, all_insights):
                if not set_insight_text(target_slide, insight_text):
                    logger.warning("Insight textbox not found for %s", instance_key)
        else:
            # Low latency sequential for small reports
            for instance_key, target_slide, payload, section in insight_slide_map:
                try:
                    insight_text = _run_async(narrator.generate_stateful_insight(
                        slide_id=instance_key,
                        slide_title=get_slide_title(target_slide) or "Data Slide",
                        slide_data=payload,
                        section=section,
                        my_brand=my_brand
                    ))
                    if not set_insight_text(target_slide, insight_text):
                        logger.warning("Insight textbox not found for %s", instance_key)
                except Exception:
                    logger.exception("Narrator failed for slide %s", instance_key)
        
        history = narrator.history
        
        # Cross-reference history back to all_slide_entries for Phase 3
        insights_by_key = {h["slide_id"]: h["insight"] for h in history}
        for entry in all_slide_entries:
            entry["insight"] = insights_by_key.get(entry["slide_id"], "")

    elif w_insights:
        if not client or not model:
            logger.warning(
                "w_insights is enabled but API client or model is missing; no insights will be generated."
            )
        elif not insight_slide_map:
            logger.warning(
                "w_insights is enabled but no slides were linked for insights after populate "
                "(charts may not have updated modified_slides)."
            )

    # Track AI failure telemetry
    if telemetry and ai_failure_count > 0:
        if hasattr(telemetry, '__setitem__'):
            telemetry["ai_failures"] = ai_failure_count
        elif hasattr(telemetry, 'add_metric'):
            telemetry.add_metric("ai_failures", ai_failure_count)

    # Phase 3: 4-P recommendations — after all other concepts and their insights
    if recommendation_concepts:
        rec_concept = recommendation_concepts[0]
        rec_dict: Dict[str, Any] = dict(project_inputs.get("recommendations") or {})
        if client and model:
            from backend.analytics_module.src.ai import generate_recommendations

            non_rec = [
                e
                for e in all_slide_entries
                if (e.get("section") or "").strip().lower() != "recommendations"
            ]
            insights_for_recommendation = [
                {
                    "slide_id": e["slide_id"],
                    "section": e.get("section", ""),
                    "title": e.get("template_slide_title", ""),
                    "insight": e.get("insight", ""),
                }
                for e in non_rec
            ]
            include_slide_data = project_inputs.get("recommendations_include_slide_data", False)
            recommendation_input = insights_for_recommendation
            if include_slide_data:
                recommendation_input = [
                    {**inv, "data": e.get("data")}
                    for inv, e in zip(insights_for_recommendation, non_rec)
                ]
            try:
                from backend.models import SurveyContextBlock
                rec_survey_context = None
                raw_ctx = project_inputs.get("survey_context")
                if isinstance(raw_ctx, dict):
                    rec_survey_context = SurveyContextBlock(**raw_ctx)
                elif project_inputs.get("own_brand") or project_inputs.get("my_brand"):
                    rec_survey_context = SurveyContextBlock(
                        target_brand=project_inputs.get("own_brand") or project_inputs.get("my_brand"),
                        category=project_inputs.get("category"),
                        survey_objective=project_inputs.get("survey_objective"),
                        testing_protocol=project_inputs.get("testing_protocol", "unspecified"),
                        market=project_inputs.get("market"),
                        base_n=project_inputs.get("response_count", 0),
                        brand_count=len(project_inputs.get("brands") or []),
                        methodology_notes=project_inputs.get("methodology_notes", ""),
                    )
                rec_dict = _run_async(generate_recommendations(
                    recommendation_input,
                    client,
                    router.resolve("recommendations") if router else model,
                    include_slide_data=include_slide_data,
                    trace_log_path=out_dir_path / "recommendations_trace.log",
                    survey_context=rec_survey_context,
                ))
            except Exception:
                logger.exception("Phase 3: generate_recommendations failed")

        proj_with_rec = {**project_inputs, "recommendations": rec_dict}
        try:
            rec_path = out_dir_path / "recommendations.json"
            with open(rec_path, "w", encoding="utf-8") as f:
                json.dump(rec_dict, f, ensure_ascii=False, indent=2)
            logger.info("Recommendations JSON written to %s", rec_path)
        except Exception:
            logger.exception("Phase 3: failed to write recommendations.json")
        logger.info("=== Phase 3: RecommendationSlide ===")
        try:
            rec_concept.load_inputs(proj_with_rec)
        except Exception:
            logger.exception("Failed to load inputs for RecommendationSlide")
        else:
            try:
                rec_payloads = rec_concept.process(
                    data_store=data_store,
                    meta_data=meta_data,
                    meta_grids=meta_grids,
                    codebook_df=codebook_df,
                    project_inputs=proj_with_rec,
                )
            except Exception:
                logger.exception("Failed to process RecommendationSlide")
                rec_payloads = {}
            if rec_payloads:
                for instance_key, payload in rec_payloads.items():
                    modified_slides: set = set()
                    try:
                        rec_concept.populate(
                            pres, instance_key, payload, modified_slides=modified_slides
                        )
                        logger.info("Populated RecommendationSlide / %s", instance_key)
                        all_modified_slides.update(modified_slides)
                        if modified_slides:
                            slide_idx = max(modified_slides)
                            insight_slide_map.append(
                                (instance_key, pres.slides[slide_idx], payload, rec_concept.section)
                            )
                    except Exception:
                        logger.exception(
                            "Failed to populate RecommendationSlide / %s", instance_key
                        )
                try:
                    excel_path = rec_concept.write_to_excel(rec_payloads, out_dir_path)
                    if excel_path:
                        logger.info("RecommendationSlide Excel written: %s", excel_path)
                except Exception:
                    logger.exception("Failed to write Excel for RecommendationSlide")
                all_slide_entries.extend(rec_concept.build_slide_list_entries(rec_payloads, {}))
            else:
                logger.info("Phase 3: RecommendationSlide produced no payloads; skipping populate.")

        if recommendation_concepts and (not client or not model):
            logger.info(
                "Phase 3: no API client or model; using project_inputs['recommendations'] "
                "only for RecommendationSlide."
            )

    # (Phase 2 Narrator previously handled here independently, now consolidated into Phase 2 above)

    # Serialize validation log
    raw_payloads["validation_report"] = {
        "status": "ready",
        "validation_log": data_store.validation_log,
        "slide_states": data_store.slide_states,
        "blocking_reasons": data_store.slide_blocking_reasons
    }

    if not all_slide_entries and not concepts and not recommendation_concepts:
         return [], raw_payloads, history, telemetry

    return all_slide_entries, raw_payloads, history, telemetry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
