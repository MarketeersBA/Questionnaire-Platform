"""
DirectIngestor — Phase A of the Pipeline Restructuring.

Single-responsibility: Read MongoDB responses and return clean, typed DataFrames.
No pivoting, no wide-format, no regex parsing. Just read the gold.

The MongoDB `responses` collection stores per-respondent documents with:
  - answers.{demographics}          → screening data
  - answers.__structured.flat_evaluations[]  → THE GOLD (brand, attribute, metric, value)
  - answers.__structured.purchase_funnel     → aw_q1..pb_q4
  - answers.__structured.overall.preference  → brand preference choice
  - answers.__structured.question_map        → question metadata
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pandas as pd
from bson import ObjectId

from backend.utils.module_answer_aliases import (
    build_analytical_context,
    extract_purchase_funnel_answers,
    normalize_module_answers,
)
from backend.utils.taste_test_question_ids import (
    load_taste_test_alias_map,
    normalize_taste_test_question_id,
    resolve_taste_test_context,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
#  Output Container
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class SurveyData:
    """
    Immutable output of DirectIngestor.load().
    Every downstream consumer receives this single object.
    """
    evaluations: pd.DataFrame        # flat_evaluations: [response_id, brand, group, attribute, metric, value, question_id]
    demographics: pd.DataFrame       # [response_id, field, value]
    purchase_funnel: pd.DataFrame    # [response_id, question, value]
    preferences: pd.DataFrame        # [response_id, preference]
    open_ends: pd.DataFrame          # [response_id, brand, attribute, metric, value]
    question_map: Dict[str, Any]     # question_id → {text, type, attribute, timing}
    response_count: int
    brands: List[str]                # All unique brands discovered in data
    brand_master_list: List[str] = field(default_factory=list)   # Canonical brand source for awareness logic
    brand_alias_map: Dict[str, str] = field(default_factory=dict) # variant(lower) -> canonical
    awareness_keys: Dict[str, str] = field(default_factory=dict)  # {"tom": "...", "other_unaided": "...", "aided": "..."}
    stage_roles: Dict[str, str] = field(default_factory=dict)  # {"consideration": "pf_q4", "mou": "pf_q7", ...}
    legacy_id_aliases: Dict[str, str] = field(default_factory=dict)
    module_usage: pd.DataFrame = field(default_factory=pd.DataFrame)  # [response_id, question, value]
    module_pricing: pd.DataFrame = field(default_factory=pd.DataFrame)
    module_brand_analyzer: pd.DataFrame = field(default_factory=pd.DataFrame)
    purchase_funnel_brands: List[str] = field(default_factory=list) # Explicit brands for purchase funnel charts
    survey_id: str = ""
    own_brand: str = ""
    category: str = ""

    # ── Derived accessors ──
    @property
    def scale_evaluations(self) -> pd.DataFrame:
        """Only numeric (scale) evaluations — excludes open-ended text."""
        if self.evaluations.empty:
            return self.evaluations
        return self.evaluations[
            self.evaluations["value"].apply(lambda x: isinstance(x, (int, float)))
        ].copy()

    @property
    def attributes(self) -> List[str]:
        """Unique evaluation attributes (e.g. Taste Profile, Aroma, ...)."""
        if self.evaluations.empty:
            return []
        return sorted(self.evaluations["attribute"].dropna().unique().tolist())

    @property
    def brand_list(self) -> List[str]:
        """Unique brands from actual evaluation data."""
        if self.evaluations.empty:
            return self.brands
        return sorted(self.evaluations["brand"].dropna().unique().tolist())

    def slice(self, filters: Dict[str, Any]) -> "SurveyData":
        """
        Slice the dataset dynamically based on demographic and brand filters.
        Returns a new SurveyData instance.
        """
        allowed_brands = filters.get("brands")
        demo_filters = filters.get("demographics", {})
        
        valid_responses = None
        
        # 1. Evaluate demographic intersections
        if demo_filters and not self.demographics.empty:
            df = self.demographics
            for field_name, allowed_values in demo_filters.items():
                if not isinstance(allowed_values, list):
                    allowed_values = [allowed_values]
                if not allowed_values:
                    continue  # Skip empty array filters
                
                # Get response_ids matching this demographic filter
                matching_mask = (df["field"] == field_name) & (df["value"].isin(allowed_values))
                ids_for_this_filter = set(df[matching_mask]["response_id"].unique())
                
                if valid_responses is None:
                    valid_responses = ids_for_this_filter
                else:
                    valid_responses = valid_responses.intersection(ids_for_this_filter)
        
        # 2. Filter wrapper
        def filter_df(df_in: pd.DataFrame, include_brand: bool = False) -> pd.DataFrame:
            if df_in.empty: 
                return df_in.copy()
            out = df_in
            if valid_responses is not None:
                out = out[out["response_id"].isin(valid_responses)]
            if include_brand and allowed_brands:
                if "brand" in out.columns:
                    out = out[out["brand"].isin(allowed_brands)]
            return out.copy()

        # 3. Apply slices
        filtered_evals = filter_df(self.evaluations, include_brand=True)
        filtered_open = filter_df(self.open_ends, include_brand=True)
        filtered_pf = filter_df(self.purchase_funnel)
        filtered_pref = filter_df(self.preferences)
        filtered_demos = filter_df(self.demographics)

        # 4. Count unique tokens in the remaining slices
        frames = [f for f in [filtered_evals, filtered_open, filtered_pf, filtered_pref, filtered_demos] if not f.empty]
        if frames:
            all_sliced = pd.concat(frames)
            new_count = all_sliced["token"].nunique() if "token" in all_sliced.columns else 0
        else:
            new_count = 0

        # Preserve brand list order from original or filter down
        new_brands = [b for b in self.brands if (not allowed_brands) or (b in allowed_brands)]

        return SurveyData(
            evaluations=filtered_evals,
            demographics=filtered_demos,
            purchase_funnel=filtered_pf,
            preferences=filtered_pref,
            open_ends=filtered_open,
            question_map=self.question_map,
            response_count=new_count,
            brands=new_brands,
            brand_master_list=self.brand_master_list,
            brand_alias_map=self.brand_alias_map,
            awareness_keys=self.awareness_keys,
            stage_roles=self.stage_roles,
            legacy_id_aliases=self.legacy_id_aliases,
            module_usage=filter_df(self.module_usage),
            module_pricing=filter_df(self.module_pricing),
            purchase_funnel_brands=self.purchase_funnel_brands,
            survey_id=self.survey_id,
            own_brand=self.own_brand,
            category=self.category
        )


# ──────────────────────────────────────────────────────────────────────────────
#  Demographic field keys we care about
# ──────────────────────────────────────────────────────────────────────────────

_DEMOGRAPHIC_KEYS = frozenset([
    "gender", "gender_auto", "age", "age_auto", "area", "education",
    "occupation", "family_income", "marital_status",
    "calculated_ses_score", "calculated_ses_class", "source",
])


# ──────────────────────────────────────────────────────────────────────────────
#  Core Ingestor
# ──────────────────────────────────────────────────────────────────────────────

class DirectIngestor:
    """
    Reads MongoDB response documents and extracts structured data
    without any pivoting, regex parsing, or wide-format transformations.
    """

    @staticmethod
    async def load(db, survey_id: str, brands_hint: Optional[List[str]] = None) -> SurveyData:
        """
        Main entry point. Fetches all responses for a survey and
        returns a clean SurveyData container.

        Parameters
        ----------
        db : AsyncIOMotorDatabase
        survey_id : str
        brands_hint : optional list of brands from survey config (used as fallback)
        """
        cursor = db.responses.find({"survey_id": survey_id})
        responses = await cursor.to_list(length=10000)

        if not responses:
            logger.warning("DirectIngestor: No responses found for survey %s", survey_id)
            return SurveyData(
                evaluations=pd.DataFrame(),
                demographics=pd.DataFrame(),
                purchase_funnel=pd.DataFrame(),
                preferences=pd.DataFrame(),
                open_ends=pd.DataFrame(),
                question_map={},
                response_count=0,
                brands=brands_hint or [],
                brand_master_list=[],
                brand_alias_map={},
                awareness_keys={"tom": "pf_q1", "other_unaided": "pf_q2", "aided": "pf_q3"},
                stage_roles={"consideration": "pf_q4", "bought_12m": "pf_q5", "bought_3m": "pf_q6", "mou": "pf_q7"},
                legacy_id_aliases={},
                module_usage=pd.DataFrame(),
                module_pricing=pd.DataFrame(),
                purchase_funnel_brands=[],
                survey_id=survey_id,
                own_brand="",
                category=""
            )

        # Fetch survey metadata for placeholders
        survey_meta = await db.surveys.find_one(
            {"_id": ObjectId(survey_id) if isinstance(survey_id, str) and len(survey_id)==24 else survey_id},
            {
                "own_brand": 1,
                "category": 1,
                "customizations": 1,
                "purchase_funnel": 1,
                "taste_test_config": 1,
                "analytical_mapping": 1,
                "module_snapshots": 1,
                "brand_usage": 1,
                "brand_pricing_behavior": 1,
            }
        )
        own_brand = ""
        category = ""
        if survey_meta:
            ttc = survey_meta.get("taste_test_config", {})
            own_brand = ttc.get("own_brand") or survey_meta.get("own_brand", "")
            category = ttc.get("category") or survey_meta.get("category", "")

        tt_ctx = resolve_taste_test_context(survey_meta)
        if not tt_ctx["alias_map"]:
            tt_ctx["alias_map"] = await load_taste_test_alias_map(db)

        data = DirectIngestor._parse_responses(
            responses,
            survey_id,
            brands_hint,
            survey_meta=survey_meta,
            tt_alias_map=tt_ctx["alias_map"],
        )
        data.own_brand = own_brand
        data.category = category
        return data

    @staticmethod
    def load_sync(responses: List[Dict[str, Any]], survey_id: str = "",
                  brands_hint: Optional[List[str]] = None) -> SurveyData:
        """Synchronous variant for use in non-async contexts (e.g. PPTX generation)."""
        return DirectIngestor._parse_responses(responses, survey_id, brands_hint, survey_meta=None)

    @staticmethod
    def _parse_responses(
        responses: List[Dict[str, Any]],
        survey_id: str,
        brands_hint: Optional[List[str]] = None,
        survey_meta: Optional[Dict[str, Any]] = None,
        tt_alias_map: Optional[Dict[str, str]] = None,
    ) -> SurveyData:
        """Core parsing logic — shared by async and sync entry points."""

        tt_aliases = tt_alias_map or {}
        if not tt_aliases and isinstance(survey_meta, dict):
            tt_aliases = resolve_taste_test_context(survey_meta)["alias_map"]

        eval_records: List[Dict[str, Any]] = []
        demo_records: List[Dict[str, Any]] = []
        pf_records: List[Dict[str, Any]] = []
        usage_records: List[Dict[str, Any]] = []
        pricing_records: List[Dict[str, Any]] = []
        ba_records: List[Dict[str, Any]] = []
        pref_records: List[Dict[str, Any]] = []
        open_end_records: List[Dict[str, Any]] = []
        question_map: Dict[str, Any] = {}
        all_brands: set = set(brands_hint or [])

        for resp in responses:
            resp_id = str(resp.get("_id", ""))
            token = resp.get("token", "")
            answers = normalize_module_answers(
                resp.get("answers", {}) or {},
                survey_meta,
                mode="read",
            )

            # ── 1. Demographics (Layer 1 fields) ──────────────────────────
            for key in _DEMOGRAPHIC_KEYS:
                val = answers.get(key)
                if val is not None:
                    demo_records.append({
                        "response_id": resp_id,
                        "token": token,
                        "field": key,
                        "value": val,
                    })

            # ── 2. Structured data (Layer 2) ──────────────────────────────
            structured = answers.get("__structured", {})
            if not isinstance(structured, dict):
                # Fallback: some responses don't have __structured
                # Try to parse _evaluations directly from answers
                structured = answers

            # 2a. flat_evaluations — THE GOLD
            flat_evals = structured.get("flat_evaluations", [])
            if isinstance(flat_evals, list):
                for fe in flat_evals:
                    if not isinstance(fe, dict):
                        continue

                    brand = fe.get("brand", "Unknown")
                    value = fe.get("value")
                    attribute = fe.get("attribute", "")
                    metric = fe.get("metric", "")
                    
                    if brand:
                        all_brands.add(brand)

                    record = {
                        "response_id": resp_id,
                        "token": token,
                        "brand": brand,
                        "group": fe.get("group", "unknown"),
                        "attribute": attribute,
                        "metric": metric,
                        "value": value,
                        "question_id": normalize_taste_test_question_id(
                            fe.get("question_id", ""),
                            tt_aliases,
                        ),
                    }

                    # Route: numeric → evaluations, text → open_ends
                    if isinstance(value, (int, float)):
                        eval_records.append(record)
                    elif isinstance(value, str) and len(value.strip()) > 1:
                        open_end_records.append(record)

            # 2b. Purchase Funnel (canonical pf_q* + legacy keys for aggregation)
            pf_data = extract_purchase_funnel_answers(answers, survey_meta, canonical_only=False)
            if isinstance(pf_data, dict):
                for pf_key, pf_val in pf_data.items():
                    pf_records.append({
                        "response_id": resp_id,
                        "token": token,
                        "question": pf_key,
                        "value": pf_val,
                    })

            module_answers = structured.get("module_answers", {})
            if isinstance(module_answers, dict):
                for mod_key, bucket_name, target in (
                    ("brand_usage", "usage", usage_records),
                    ("brand_pricing_behavior", "pricing", pricing_records),
                    ("brand_analyzer", "brand_analyzer", ba_records),
                ):
                    mod_bucket = module_answers.get(mod_key)
                    if isinstance(mod_bucket, dict):
                        for qid, qval in mod_bucket.items():
                            target.append({
                                "response_id": resp_id,
                                "token": token,
                                "question": qid,
                                "value": qval,
                                "module": mod_key,
                            })

            # 2c. Overall Preference
            overall = structured.get("overall", {})
            if isinstance(overall, dict) and "preference" in overall:
                pref_records.append({
                    "response_id": resp_id,
                    "token": token,
                    "preference": overall["preference"],
                })
                # Track preference brand
                pref_brand = overall["preference"]
                if pref_brand:
                    all_brands.add(pref_brand)

            # 2d. Question Map (merge — last writer wins, which is fine)
            qm = structured.get("question_map", {})
            if not qm:
                meta = structured.get("_metadata", {})
                if isinstance(meta, dict):
                    qm = meta.get("question_map", {})
            if isinstance(qm, dict):
                question_map.update(qm)

            # ── 3. Fallback: Parse _evaluations if flat_evaluations is empty ──
            if not flat_evals:
                DirectIngestor._fallback_parse_evaluations(
                    resp_id,
                    token,
                    answers,
                    eval_records,
                    open_end_records,
                    all_brands,
                    tt_aliases,
                )

        # ── Build DataFrames ──────────────────────────────────────────────
        brands_sorted = sorted(all_brands)
        brand_master_list = DirectIngestor._resolve_brand_master_list(
            survey_meta=survey_meta,
            discovered_brands=brands_sorted,
            brands_hint=brands_hint,
        )
        
        # Explicitly extract the purchase funnel brands
        purchase_funnel_brands = []
        if isinstance(survey_meta, dict):
            pf_conf = survey_meta.get("purchase_funnel", {})
            if isinstance(pf_conf, dict):
                pf_brand_list = pf_conf.get("brand_list", [])
                if isinstance(pf_brand_list, list):
                    for item in pf_brand_list:
                        if isinstance(item, str) and item.strip():
                            purchase_funnel_brands.append(item.strip())
                        elif isinstance(item, dict):
                            name = item.get("name_en") or item.get("name") or item.get("brand")
                            if isinstance(name, str) and name.strip():
                                purchase_funnel_brands.append(name.strip())

        brand_alias_map = DirectIngestor._resolve_brand_alias_map(survey_meta=survey_meta)
        analytical_ctx = build_analytical_context(survey_meta or {})
        awareness_keys = analytical_ctx.get("awareness_keys") or DirectIngestor._resolve_awareness_keys(survey_meta)
        stage_roles = analytical_ctx.get("stage_roles") or {}
        legacy_id_aliases = {
            **(analytical_ctx.get("legacy_id_aliases") or {}),
            **tt_aliases,
        }

        if tt_aliases and question_map:
            question_map = {
                normalize_taste_test_question_id(k, tt_aliases): v
                for k, v in question_map.items()
            }

        logger.info(
            "DirectIngestor: Parsed %d responses → %d evals, %d demographics, "
            "%d PF records, %d preferences, %d open-ends, %d brands",
            len(responses), len(eval_records), len(demo_records),
            len(pf_records), len(pref_records), len(open_end_records),
            len(brands_sorted),
        )

        return SurveyData(
            evaluations=pd.DataFrame(eval_records) if eval_records else pd.DataFrame(
                columns=["response_id", "token", "brand", "group", "attribute", "metric", "value", "question_id"]
            ),
            demographics=pd.DataFrame(demo_records) if demo_records else pd.DataFrame(
                columns=["response_id", "token", "field", "value"]
            ),
            purchase_funnel=pd.DataFrame(pf_records) if pf_records else pd.DataFrame(
                columns=["response_id", "token", "question", "value"]
            ),
            preferences=pd.DataFrame(pref_records) if pref_records else pd.DataFrame(
                columns=["response_id", "token", "preference"]
            ),
            open_ends=pd.DataFrame(open_end_records) if open_end_records else pd.DataFrame(
                columns=["response_id", "token", "brand", "group", "attribute", "metric", "value", "question_id"]
            ),
            question_map=question_map,
            response_count=len(set(r.get("token", "") for r in responses if r.get("token", ""))),
            brands=brands_sorted,
            brand_master_list=brand_master_list,
            brand_alias_map=brand_alias_map,
            awareness_keys=awareness_keys,
            stage_roles=stage_roles,
            legacy_id_aliases=legacy_id_aliases,
            module_usage=pd.DataFrame(usage_records) if usage_records else pd.DataFrame(
                columns=["response_id", "token", "question", "value", "module"]
            ),
            module_pricing=pd.DataFrame(pricing_records) if pricing_records else pd.DataFrame(
                columns=["response_id", "token", "question", "value", "module"]
            ),
            module_brand_analyzer=pd.DataFrame(ba_records) if ba_records else pd.DataFrame(
                columns=["response_id", "token", "question", "value", "module"]
            ),
            purchase_funnel_brands=purchase_funnel_brands,
            survey_id=survey_id,
        )

    @staticmethod
    def _extract_purchase_funnel_data(answers: Dict[str, Any], structured: Dict[str, Any]) -> Dict[str, Any]:
        """Deprecated — use module_answer_aliases.extract_purchase_funnel_answers."""
        return extract_purchase_funnel_answers(answers, canonical_only=False)

    @staticmethod
    def _resolve_brand_master_list(
        survey_meta: Optional[Dict[str, Any]],
        discovered_brands: List[str],
        brands_hint: Optional[List[str]],
    ) -> List[str]:
        """
        Phase-1 locked precedence:
          explicit config brands > discovered brands > brands hint
        """
        explicit = DirectIngestor._extract_explicit_config_brands(survey_meta or {})
        if explicit:
            return explicit
        if discovered_brands:
            return sorted([b for b in discovered_brands if isinstance(b, str) and b.strip()])
        return sorted([b for b in (brands_hint or []) if isinstance(b, str) and b.strip()])

    @staticmethod
    def _extract_explicit_config_brands(survey_meta: Dict[str, Any]) -> List[str]:
        candidates: List[str] = []
        customs = survey_meta.get("customizations", {}) if isinstance(survey_meta, dict) else {}
        pf_conf = survey_meta.get("purchase_funnel", {}) if isinstance(survey_meta, dict) else {}
        ttc = survey_meta.get("taste_test_config", {}) if isinstance(survey_meta, dict) else {}

        for source in (customs.get("brands", []), pf_conf.get("brand_list", []), ttc.get("brand_list", [])):
            if isinstance(source, list):
                for item in source:
                    if isinstance(item, str) and item.strip():
                        candidates.append(item.strip())
                    elif isinstance(item, dict):
                        name = item.get("name_en") or item.get("name") or item.get("brand")
                        if isinstance(name, str) and name.strip():
                            candidates.append(name.strip())

        seen = set()
        out: List[str] = []
        for b in candidates:
            k = b.casefold()
            if k not in seen:
                seen.add(k)
                out.append(b)
        return out

    @staticmethod
    def _resolve_brand_alias_map(survey_meta: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """
        Phase-1 locked precedence:
          explicit alias map > identity mapping (empty dict means identity)
        Normalized output:
          variant(casefold+strip) -> canonical(original trimmed)
        """
        if not isinstance(survey_meta, dict):
            return {}

        candidate_maps = [
            survey_meta.get("brand_alias_map"),
            survey_meta.get("brand_aliases"),
            (survey_meta.get("purchase_funnel", {}) or {}).get("brand_alias_map"),
            (survey_meta.get("purchase_funnel", {}) or {}).get("brand_aliases"),
            (survey_meta.get("taste_test_config", {}) or {}).get("brand_alias_map"),
            (survey_meta.get("taste_test_config", {}) or {}).get("brand_aliases"),
            (survey_meta.get("analytical_mapping", {}) or {}).get("brand_alias_map"),
            (survey_meta.get("analytical_mapping", {}) or {}).get("brand_aliases"),
            (survey_meta.get("customizations", {}) or {}).get("brand_alias_map"),
            (survey_meta.get("customizations", {}) or {}).get("brand_aliases"),
        ]

        for raw_map in candidate_maps:
            normalized = DirectIngestor._normalize_alias_mapping(raw_map)
            if normalized:
                return normalized
        return {}

    @staticmethod
    def _normalize_alias_mapping(raw_map: Any) -> Dict[str, str]:
        out: Dict[str, str] = {}
        if not raw_map:
            return out

        if isinstance(raw_map, dict):
            for key, val in raw_map.items():
                # Format A: {canonical: [variant1, variant2]}
                if isinstance(val, list):
                    canonical = str(key).strip()
                    if not canonical:
                        continue
                    out[canonical.casefold()] = canonical
                    for variant in val:
                        if isinstance(variant, str) and variant.strip():
                            out[variant.strip().casefold()] = canonical
                    continue

                # Format B: {variant: canonical}
                if isinstance(val, str):
                    variant = str(key).strip()
                    canonical = val.strip()
                    if variant and canonical:
                        out[variant.casefold()] = canonical
                    continue
            return out

        if isinstance(raw_map, list):
            for item in raw_map:
                if not isinstance(item, dict):
                    continue
                canonical = item.get("canonical") or item.get("brand") or item.get("name")
                aliases = item.get("aliases") or item.get("variants") or []
                if isinstance(canonical, str) and canonical.strip():
                    c = canonical.strip()
                    out[c.casefold()] = c
                    if isinstance(aliases, list):
                        for variant in aliases:
                            if isinstance(variant, str) and variant.strip():
                                out[variant.strip().casefold()] = c
            return out

        return out

    @staticmethod
    def _resolve_awareness_keys(survey_meta: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """
        Canonical awareness question key resolver for direct path.
        Defaults:
          tom -> aw_q1
          other_unaided -> aw_q2
          aided -> aw_q3
        """
        defaults = {"tom": "pf_q1", "other_unaided": "pf_q2", "aided": "pf_q3"}
        if not isinstance(survey_meta, dict):
            return defaults

        mapping = survey_meta.get("analytical_mapping", {}) or {}

        def _clean(v: Any, fallback: str) -> str:
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, list) and v and isinstance(v[0], str) and v[0].strip():
                return v[0].strip()
            return fallback

        return {
            "tom": _clean(mapping.get("tom"), defaults["tom"]),
            "other_unaided": _clean(mapping.get("unaided"), defaults["other_unaided"]),
            "aided": _clean(mapping.get("aided"), defaults["aided"]),
        }

    @staticmethod
    def _fallback_parse_evaluations(
        resp_id: str, token: str,
        answers: Dict[str, Any],
        eval_records: list, open_end_records: list,
        all_brands: set,
        tt_alias_map: Optional[Dict[str, str]] = None,
    ):
        """
        Fallback parser for responses that lack flat_evaluations.
        Handles legacy _evaluations dict and evaluations list formats.
        """
        evals = answers.get("_evaluations") or answers.get("evaluations")
        if not evals:
            return

        if isinstance(evals, dict):
            # Nested: { group: { brand: { q_id: value } } }
            for group, brands_data in evals.items():
                if not isinstance(brands_data, dict):
                    continue
                for brand, questions in brands_data.items():
                    if not isinstance(questions, dict):
                        continue
                    all_brands.add(brand)
                    for q_id, val in questions.items():
                        canonical_qid = normalize_taste_test_question_id(
                            q_id, tt_alias_map or {}
                        )
                        record = {
                            "response_id": resp_id,
                            "token": token,
                            "brand": brand,
                            "group": group,
                            "attribute": canonical_qid,
                            "metric": canonical_qid,
                            "value": val,
                            "question_id": canonical_qid,
                        }
                        if isinstance(val, (int, float)):
                            eval_records.append(record)
                        elif isinstance(val, str) and len(val.strip()) > 1:
                            open_end_records.append(record)

        elif isinstance(evals, list):
            # List of {brand, attribute, metric, value, question_id}
            for item in evals:
                if not isinstance(item, dict):
                    continue
                brand = item.get("brand", "Unknown")
                all_brands.add(brand)
                val = item.get("value")
                record = {
                    "response_id": resp_id,
                    "token": token,
                    "brand": brand,
                    "group": item.get("group", "unknown"),
                    "attribute": item.get("attribute", ""),
                    "metric": item.get("metric", ""),
                    "value": val,
                    "question_id": normalize_taste_test_question_id(
                        item.get("question_id", ""),
                        tt_alias_map or {},
                    ),
                }
                if isinstance(val, (int, float)):
                    eval_records.append(record)
                elif isinstance(val, str) and len(val.strip()) > 1:
                    open_end_records.append(record)
