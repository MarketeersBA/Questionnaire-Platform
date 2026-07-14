import pandas as pd
import re
from typing import Dict, Optional, List

from backend.analytics_module.src.BrandAnalyzer.main_window import run_equity_from_data
from backend.analytics_module.src.common import select_target_columns
from backend.analytics_module.src.common.pivot_maker import normalize_one_hot_to_rows

def build_brand_analyzer_2(
        data_store,
        brands_list,
        project_inputs,
        item,
        meta_data=None,
        excel_path: Optional[str] = None,
):
    """
    [PHASE 4] Advanced PPTX Slide Builder
    Orchestrates the 3-view presentation (Combined, Performance, Imagery).
    """
    df = data_store.get("decoded_raw_data").copy()
    visual_id = item.get("visual_id", "Combined")

    # 1. Driver Categorization logic (Systematic Filter)
    def _is_performance(attr_id: str) -> bool:
        perf_keywords = ['quality', 'value', 'price', 'ingredient', 'hydration', 'expert', 'treatment', 'economical', 'suitable']
        return any(k in attr_id.lower() for k in perf_keywords)

    def _is_imagery(attr_id: str) -> bool:
        imagery_keywords = ['trust', 'innovat', 'famous', 'youth', 'fun', 'special', 'chic', 'elegant', 'prestige', 'feel']
        return any(k in attr_id.lower() for k in imagery_keywords)

    # 2. Purchase Intent / Priority Calculation
    purchase_intent_id = project_inputs.get('loop_purchase_intent', 'Satisfied')
    brand_analyzer = pd.DataFrame()
    
    if purchase_intent_id:
        purchase_intent_cols = select_target_columns(df.columns, re.compile(f'{purchase_intent_id}'))
        df[purchase_intent_cols] = (
            df[purchase_intent_cols]
            .apply(lambda col: col.replace(project_inputs.get('purchase_intent_scales', {})).infer_objects(copy=False))
        )

        # Grids mapping
        grids = item.get('module_input', ["performance", "imagery"])
        grids_prefixes = []
        # If the prefix itself is stored under the view name, use it; otherwise fallback to perception grid
        for g in grids:
            val = project_inputs.get(g) or project_inputs.get("ba_q2_perception") 
            if val:
                grids_prefixes.extend([val] if isinstance(val, str) else val)
        
        # Ensure fallback to the standard perception prefix if nothing was found
        if not grids_prefixes and project_inputs.get("ba_q2_perception"):
            grids_prefixes = [project_inputs["ba_q2_perception"]]

        if grids_prefixes:
            # Flatten grid for analysis
            Xdf = normalize_one_hot_to_rows(df, brand_after_s_us=grids_prefixes,
                                            brand_after_dot=[purchase_intent_id])
            
            brand_base = Xdf.drop(columns=purchase_intent_id).dropna()["brand"].value_counts()
            
            grid_cols = []
            for prefix in grids_prefixes:
                grid_cols.extend(select_target_columns(df.columns, re.compile(f'{prefix}_')))
            grid_cols = [c for c in grid_cols if not (c.endswith("[Exclusive]") or c.endswith("None"))]

            def _attr_and_brand(col_name):
                parts = col_name.split('_', 2)
                return (parts[1], parts[2]) if len(parts) >= 3 else (None, None)

            # Build Attribute List & Apply Filters
            attributes_from_grid = []
            seen = set()
            for c in grid_cols:
                attr, _ = _attr_and_brand(c)
                if attr is not None and attr not in seen:
                    # SYSTEMATIC FILTERING:
                    if visual_id == "Performance" and not _is_performance(attr):
                        continue
                    if visual_id == "Imagery" and not _is_imagery(attr):
                        continue
                        
                    seen.add(attr)
                    attributes_from_grid.append(attr)

            if not attributes_from_grid:
                # If no attributes matched the filter, return empty signaling no data for this view
                return pd.DataFrame()

            # Filter columns to only include selected brands and attributes
            grid_cols = [c for c in grid_cols if _attr_and_brand(c)[1] in brands_list and _attr_and_brand(c)[0] in attributes_from_grid]
            brand_awareness = [int(brand_base.get(b, 0)) for b in brands_list] if brands_list else []
            
            # Construct score array
            col_for = {}
            for c in grid_cols:
                attr, brand = _attr_and_brand(c)
                col_for[(attr, brand)] = c
            
            ordered_cols = []
            for attr in attributes_from_grid:
                for brand in brands_list:
                    if (attr, brand) in col_for:
                        ordered_cols.append(col_for[(attr, brand)])

            if not ordered_cols:
                return pd.DataFrame(0.0, index=["CBI"], columns=brands_list)

            scores_df = df[ordered_cols].copy().astype(str)
            n_brands = len(brands_list)
            pi_cols = purchase_intent_cols[:n_brands]
            pref_share = df[pi_cols].values.astype(str).flatten().tolist()

            # Execute Core Equity Engine
            cbi_df, dt_pop_df = run_equity_from_data(
                attributes=attributes_from_grid,
                brands=brands_list,
                brand_awareness=brand_awareness,
                scores_df=scores_df,
                pref_share=pref_share,
                score_type="check",
                sheet_layout="brands_within_attrs",
            )

            # Format Slide DataFrame
            cbi_sorted = cbi_df.sort_values("CBI", ascending=False)
            brand_order = cbi_sorted["Brand"].tolist()

            cbi_values = cbi_sorted["CBI"].values.round(0).astype(int)
            cbi_row = pd.DataFrame([cbi_values], columns=brand_order, index=["CBI"])
            
            dt_pop_attr = dt_pop_df.set_index("Attribute").drop(columns=["#"], errors="ignore")
            dt_pop_attr = dt_pop_attr[[c for c in brand_order if c in dt_pop_attr.columns]]
            
            brand_analyzer = pd.concat([cbi_row, dt_pop_attr], axis=0)
            
            out_path = f"{project_inputs['output_dir']}/ba_brand_analyzer_{visual_id}.xlsx"
            brand_analyzer.to_excel(out_path)
            return brand_analyzer

    return pd.DataFrame()
