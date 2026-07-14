import pandas as pd
from typing import List, Dict, Any, Tuple
from backend.analytics_module.project_inputs_setter import finalize_project_inputs
from backend.analytics_module.src.common.record_factory import RecordFactory
from backend.utils.module_answer_aliases import (
    ALL_PF_KEYS,
    build_analytical_context,
    normalize_module_answers,
)

class PlatformBridge:
    """
    Bridge between Questioner Platform data structures and the Analytical Engine.
    Handles the transformation of snapshots and responses into high-performance DataFrames.
    """
    
    @staticmethod
    def transform_survey_to_metadata(survey_doc: Dict[str, Any]) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Transforms a platform survey snapshot into metadata DataFrames.
        Enforces system types for critical screening questions (Age, Gender, Income).
        """
        questions = survey_doc.get("template_snapshot_questions", [])
        schema = survey_doc.get("template_snapshot_schema", {})
        
        meta_rows = []
        for q in questions:
            # Platform uses 'id' and 'label' instead of 'name' and 'title' in snapshots
            q_id = q.get("id") or q.get("name")
            q_type = str(q.get("type", "unknown")).lower()
            q_title = q.get("title") or q.get("text") or q.get("label") or q_id

            # Normalize question types for the engine
            if q_type == "open_ended":
                analysis_type = "Unaided"
            elif q_type in ["single choice", "mcq", "radio"]:
                analysis_type = "Select (Radio Button)"
            elif q_type in ["multiple choice", "checkbox"]:
                analysis_type = "Select (Check Box)"
            elif q_type == "grid":
                analysis_type = "Grid"
            else:
                analysis_type = q_type

            meta_rows.append({
                "question_name": q_id,
                "question_type": analysis_type,
                "header": q_title,
                "list_name": q.get("list_name"),
                "list_type": q.get("list_type", "Predefined"),
                "parent_list": q.get("parent_list"),
                "loop": q.get("loop_name"),
                "loop_parent_list": q.get("loop_parent_list")
            })
            
        # Dynamic attribute extraction for Taste Test
        tt_config = survey_doc.get("taste_test_config", {})
        if tt_config:
            attrs = tt_config.get("attribute_sequence", [])
            for attr_group in attrs:
                main = attr_group.get("main_attribute")
                subs = attr_group.get("sub_attributes", [])
                for s in subs:
                    # Treat sub-attributes as rating metrics
                    meta_rows.append({
                        "question_name": s,
                        "question_type": "Select (Radio Button)", # Scale rating
                        "header": s,
                        "list_name": None,
                        "list_type": "Predefined",
                        "parent_list": None,
                        "loop": main,
                        "loop_parent_list": None
                    })

        meta_data = pd.DataFrame(meta_rows)
        # Drop duplicates in case of overlap between snapshot and config
        if not meta_data.empty:
            meta_data = meta_data.drop_duplicates(subset=["question_name"])
        
        # Build meta_grids with advanced direction detection
        grid_rows = []
        for q in questions:
            if str(q.get("type")).lower() == "grid":
                grid_rows.append({
                    "question_name": q.get("name"),
                    "question_direction": q.get("direction", "Rows"),
                    "response_type": q.get("response_type", "Radio"),
                    "row_list_name": q.get("row_list_name"),
                    "row_list_type": q.get("row_list_type", "Predefined"),
                    "col_list_name": q.get("col_list_name"),
                    "col_list_type": q.get("col_list_type", "Predefined")
                })
        meta_grids = pd.DataFrame(grid_rows)
        
        # Standardize codebook mapping
        lists = schema.get("lists", {})
        codebook_data = {}
        for list_name, options in lists.items():
            # Ensure clean integer codes where applicable
            cleaned = {int(k) if str(k).isdigit() else k: v for k, v in options.items()}
            codebook_data[list_name] = cleaned
            
        codebook_df = pd.DataFrame.from_dict(codebook_data, orient='columns')
        if not codebook_df.empty:
            codebook_df = codebook_df.reset_index().rename(columns={'index': 'code'})
        
        return meta_data, meta_grids, codebook_df

    @staticmethod
    def _parse_structured_dict(tk: str, v: Dict[str, Any], token_map: Dict[str, Any]):
        # Modern gateway schemas often use a nested dict for _evaluations
        # { "group": { "brand": { "q_id": value } } }
        evals_data = v.get("_evaluations") or v.get("evaluations") or v.get("flat_evaluations")
        q_map = v.get("question_map", {})

        if isinstance(evals_data, dict):
            for group, brands_data in evals_data.items():
                if isinstance(brands_data, dict):
                    for brand, questions in brands_data.items():
                        if brand:
                            token_map[tk]["_extracted_brands"].add(brand)
                        for q_id, val in questions.items():
                            token_map[tk][q_id] = val
                            # Resolve attribute from question_map to create brand_attr mapping
                            q_info = q_map.get(q_id, {})
                            attr = q_info.get("attribute") or q_info.get("metric_label")
                            if brand and attr:
                                 token_map[tk][f"{attr}_{brand}"] = val
        elif isinstance(evals_data, list):
            PlatformBridge._parse_evaluations_list(tk, evals_data, token_map)
        
        # Handle nested purchase funnel inside __structured
        pf = v.get("purchase_funnel")
        if isinstance(pf, dict):
            for pf_key, pf_val in pf.items():
                token_map[tk][pf_key] = pf_val

        module_answers = v.get("module_answers")
        if isinstance(module_answers, dict):
            for _module_id, bucket in module_answers.items():
                if isinstance(bucket, dict):
                    for qid, qval in bucket.items():
                        token_map[tk][qid] = qval

    @staticmethod
    def _parse_evaluations_list(tk: str, evals_list: List[Dict[str, Any]], token_map: Dict[str, Any]):
        for item in evals_list:
            if isinstance(item, dict):
                brand = item.get("brand")
                attr = item.get("attribute")
                metric = item.get("metric")
                val = item.get("value")
                q_id = item.get("question_id")
                
                if brand:
                    token_map[tk]["_extracted_brands"].add(brand)
                
                # Map to both ID and brand_attr for coverage
                if q_id:
                    token_map[tk][q_id] = val
                if brand and attr:
                    token_map[tk][f"{attr}_{brand}"] = val
                    if metric and metric != attr:
                         token_map[tk][f"{metric}_{brand}"] = val

    @staticmethod
    def transform_responses_to_df(
        responses: List[Dict[str, Any]],
        meta_data: pd.DataFrame = None,
        brands: List[str] = None,
        survey_doc: Dict[str, Any] = None,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Converts MongoDB response records into two DataFrames:
        1. df_wide: Traditional wide format for screening and flat questions.
        2. df_long: Unified metric records (metric, brand, value) via RecordFactory.
        """
        if not responses:
            return pd.DataFrame(), pd.DataFrame()
        
        # 1. Generate Long Table (Metrics)
        df_long = pd.DataFrame()
        if meta_data is not None:
             df_long = RecordFactory.explode_responses(responses, meta_data, brands=brands)
            
        token_map = {}
        for r in responses:
            tk = r.get("token")
            if not tk: continue
            
            if tk not in token_map:
                token_map[tk] = {
                    "sys_RespNum": str(r.get("_id")),
                    "sys_Status": "unknown",
                    "sys_Timestamp": r.get("created_at"),
                    "token": tk,
                    "_extracted_brands": set() # Internal tracker for dynamically discovered brands
                }
            
            # Join answer layers based on source
            ans = normalize_module_answers(r.get("answers", {}) or {}, survey_doc, mode="read")
            for k, v in ans.items():
                if k == "_evaluations" and isinstance(v, dict):
                    # Legacy Taste Test nested evaluations
                    for group_name, brand_dict in v.items():
                        if isinstance(brand_dict, dict):
                            for brand, attrs in brand_dict.items():
                                token_map[tk]["_extracted_brands"].add(brand)
                                if isinstance(attrs, dict):
                                    for attr_key, attr_val in attrs.items():
                                        # Standardize to Attribute_Brand format for all evaluations
                                        token_map[tk][f"{attr_key}_{brand}"] = attr_val
                elif k == "__structured" and isinstance(v, dict):
                    # Modern in_app_gateway structured evaluations (wrapped)
                    PlatformBridge._parse_structured_dict(tk, v, token_map)
                elif k == "evaluations" and isinstance(v, list):
                    # direct evaluations list
                    PlatformBridge._parse_evaluations_list(tk, v, token_map)
                elif k == "purchase_funnel" and isinstance(v, dict):
                    # Flatten purchase funnel dictionary directly into top-level columns
                    for pf_key, pf_val in v.items():
                        token_map[tk][pf_key] = pf_val
                elif k == "purchase_funnel" and isinstance(v, dict):
                    # Flatten purchase funnel dictionary directly into top-level columns
                    for pf_key, pf_val in v.items():
                        token_map[tk][pf_key] = pf_val
                else:
                    token_map[tk][k] = v
                
            # If any layer was submitted, mark as submitted
            if r.get("submitted_at"):
                token_map[tk]["sys_Status"] = "submitted"
                token_map[tk]["sys_SubmittedAt"] = r.get("submitted_at")
            
        df_wide = pd.DataFrame.from_dict(token_map, orient='index')
        return df_wide, df_long

    @staticmethod
    def build_project_inputs(survey_doc: Dict[str, Any], output_dir: str, df_responses: pd.DataFrame = None) -> Dict[str, Any]:
        """
        Generates analysis configuration inputs directly from the survey model.
        Decouples the analytical engine from specific platform UI fields.
        """
        customs = survey_doc.get("customizations", {})
        
        # Infer analytical boundaries from base survey type
        survey_type = survey_doc.get("type", "standard")
        
        if survey_type == "taste_test":
            research_type = "TasteTest"
            sections = ["Taste Test"]
            if survey_doc.get("purchase_funnel", {}).get("is_enabled", False):
                sections.insert(0, "Brand Awareness and Purchase Funnel")
        else:
            research_type = survey_doc.get("research_type", "UsageAndAttitude")
            sections = survey_doc.get("analysis_sections", [])

        # Base input structure
        inputs = {
            "project_name": survey_doc.get("company_name", "Survey"),
            "output_dir": output_dir,
            "research_type": research_type,
            "sections": sections,
            "focus_brands": customs.get("brands", []),
            "screening_cols": survey_doc.get("screening_cols", []),
            "handle_unaided_with_ai": True,
            "w_insights": True,
            "respondent_target": survey_doc.get("respondent_target", 0),
            "respondent_count": survey_doc.get("respondent_count", 0)
        }

        # Dynamic Screening Column Extraction
        if not inputs["screening_cols"]:
            l1_config = survey_doc.get("layer1_screening_config", {})
            potential_cols = ["gender", "age", "location", "education", "occupation", "marital_status", "family_income"]
            # Map location to area if needed by the engine
            actual_cols = []
            for pc in potential_cols:
                if l1_config.get(pc) or (pc == "location" and l1_config.get("area")):
                    actual_cols.append("area" if pc == "location" else pc)
            inputs["screening_cols"] = actual_cols
        
        # Brand detection
        brands = customs.get("brands", [])
        
        # Dynamic extraction of focus_brands if empty
        if not brands and df_responses is not None and "_extracted_brands" in df_responses.columns:
            extracted = set()
            for row_brands in df_responses["_extracted_brands"].dropna():
                extracted.update(row_brands)
            if extracted:
                brands = list(extracted)
                inputs["focus_brands"] = brands

        if brands:
            inputs["my_brand"] = customs.get("my_brand") or brands[0]
            
        # Discover all comparison columns from extracted brand data
        if df_responses is not None:
            comp_cols = set()
            # Any column that starts or ends with a focus brand or is a known structured ID
            for col in df_responses.columns:
                for b in brands:
                    # Check both Attribute_Brand (Standard) and Brand_Attribute (Legacy/Inverted)
                    if col.endswith(f"_{b}"):
                        comp_cols.add(col.rsplit("_", 1)[0])
                    elif col.startswith(f"{b}_"):
                        comp_cols.add(col.split("_", 1)[1])
            
            # Module question columns from snapshots + normalized PF aliases
            ctx = build_analytical_context(survey_doc)
            module_cols = set(ctx.get("awareness_question_ids") or [])
            module_cols.update(ctx.get("stage_question_ids") or [])
            for module_ids in (ctx.get("module_question_ids") or {}).values():
                module_cols.update(module_ids or [])
            module_cols.update(ALL_PF_KEYS)
            for col in module_cols:
                if col in df_responses.columns:
                    comp_cols.add(col)
            
            inputs["all_comparison_columns"] = list(comp_cols)

        # For Taste Test, we need specialized mapping if missing
        if inputs["research_type"] == "TasteTest":
            if not inputs.get("overall_features"):
                # Discover attributes by looking for common suffixes or prefixes from any brand
                attrs = set()
                fb = inputs["focus_brands"]
                cols = df_responses.columns if df_responses is not None else []
                for b in fb:
                    suffix = f"_{b}"
                    prefix = f"{b}_"
                    for col in cols:
                        if col.endswith(suffix):
                            attr = col[:-len(suffix)]
                        elif col.startswith(prefix):
                            attr = col[len(prefix):]
                        else:
                            continue
                            
                        # Skip system/generated stems and known non-feature columns
                        if any(x in attr for x in ["_custom_sub_", "_fallback_", "sys_", "aw_", "pb_"]):
                            continue
                        attrs.add(attr)
                
                if attrs:
                    # Sort to keep deterministic ordering
                    sorted_attrs = sorted(list(attrs))
                    inputs["overall_features"] = sorted_attrs
                    # Also populate sub_features if missing, as they often overlap in Taste Tests
                    if not inputs.get("sub_features"):
                         inputs["sub_features"] = sorted_attrs
            
            if not inputs.get("comparators"):
                # Generate unique pairs for comparison
                pairs = []
                fb = inputs["focus_brands"]
                for i in range(len(fb)):
                    for j in range(i + 1, len(fb)):
                        pairs.append([fb[i], fb[j]])
                if pairs:
                    # Map to the structure expected by ComparatorOrchestrator
                    inputs["comparators"] = [{"pair": p, "segment": None} for p in pairs]
            
            if not inputs.get("comparison_purchase_intent"):
                ctx = build_analytical_context(survey_doc)
                consideration_ids = ctx.get("stage_question_ids") or []
                for q in consideration_ids:
                    if df_responses is not None and q in df_responses.columns:
                        inputs["comparison_purchase_intent"] = q
                        break
                if "comparison_purchase_intent" not in inputs:
                    inputs["comparison_purchase_intent"] = (
                        (ctx.get("stage_roles") or {}).get("consideration") or "pf_q4"
                    )

            if not inputs.get("loop_why_mou"):
                if inputs.get("overall_features"):
                    inputs["loop_why_mou"] = inputs["overall_features"][0]
                else:
                    inputs["loop_why_mou"] = "Attribute"

            if not inputs.get("mou"):
                ctx = build_analytical_context(survey_doc)
                inputs["mou"] = (ctx.get("stage_roles") or {}).get("mou") or "pf_q7"

        analytical_ctx = build_analytical_context(survey_doc)
        mapping = dict(survey_doc.get("analytical_mapping", {}) or {})
        mapping.setdefault("stage_roles", analytical_ctx.get("stage_roles") or {})
        mapping.setdefault("legacy_id_aliases", analytical_ctx.get("legacy_id_aliases") or {})
        mapping.setdefault("awareness_keys", analytical_ctx.get("awareness_keys") or {})
        inputs.update(mapping)
        
        return finalize_project_inputs(inputs)

    @staticmethod
    def generate_sid(survey_doc: Dict[str, Any], responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        [ADVANCED] Generates a Survey Intermediate Document (SID).
        This is a portable, human-readable JSON package containing the decoded
        state of the entire survey for handoff to the analytical engine.
        """
        # 1. Transform Metadata
        meta_data, meta_grids, codebook_df = PlatformBridge.transform_survey_to_metadata(survey_doc)
        
        # 2. Transform Responses
        df_raw = PlatformBridge.transform_responses_to_df(responses, survey_doc=survey_doc)
        
        # 3. Setup Project Inputs
        project_inputs = PlatformBridge.build_project_inputs(survey_doc, output_dir="./tmp", df_responses=df_raw)
        
        return {
            "metadata": {
                "questions": meta_data.to_dict(orient="records"),
                "grids": meta_grids.to_dict(orient="records"),
                "codebook": codebook_df.to_dict(orient="records")
            },
            "data": df_raw.to_dict(orient="records"),
            "config": project_inputs,
            "generated_at": datetime.utcnow().isoformat()
        }
