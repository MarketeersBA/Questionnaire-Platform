import logging

from .funcs import normalize_one_hot_to_rows, pivot_choices
from ..common import get_question_type
from ..common.data_helpers import rescale_columns


def load_pivots(data_store, pivots_needed, project_inputs, out_dir, meta_data, codebook_df):
    df = data_store.get("decoded_raw_data")
    # 1. Comparison Pivots (Scalers & Decoded Scalers)
    if pivots_needed.get("Comparison"):
        research_type = project_inputs.get('research_type')

        if research_type == "TasteTest":
            comparators_map = project_inputs.get('comparators_map', {})

        elif research_type == "ProductPlacement":
            comparators_map = project_inputs.get('suffix_map', {})

        cols_scalers = project_inputs.get('all_comparison_columns', [])
        rescale_5_to_10 = project_inputs.get('rescale_5_to_10', [])

        df_long = data_store.get("metrics_long_table")
        
        if df_long is not None and not df_long.empty:
            try:
                # 1. Performance Optimization: Pivot ONE-TIME for all relevant attributes
                # We need to normalize metrics from cols_scalers as they might have suffixes (e.g. Bite1 -> Bite)
                # while df_long usually has clean root names.
                brands = project_inputs.get('focus_brands', [])
                
                # Build mapping of question_id to canonical metric names from metadata
                q_map = meta_data.set_index("question_name")["header"].to_dict()
                
                valid_metrics = set()
                import re
                for m in cols_scalers:
                    # Resolve ID to human name first
                    resolved = q_map.get(m, m)
                    root = resolved
                    
                    for b in brands:
                        pattern_brand = str(b)
                        # Handle prefixes, suffixes and custom sub-attributes
                        if "custom_sub_" in root:
                             parts = root.split("custom_sub_")
                             if len(parts) > 1:
                                 root = parts[1].rsplit("_", 1)[0]
                             break
                        elif root.endswith(f"_{pattern_brand}"): 
                            root = root.rsplit("_", 1)[0]
                            break
                        elif root.startswith(f"{pattern_brand}_"): 
                            root = root.split("_", 1)[1]
                            break
                        elif root.startswith(pattern_brand):
                            # Handle cases like AbuAufAfterTasting
                            root = root[len(pattern_brand):]
                            break
                            
                    # Handle Numeric Suffixes (e.g. Bite1)
                    root = re.sub(r'\s*\d+$', '', root)
                    valid_metrics.add(root)

                
                # Pre-filter for performance
                pivot_data = df_long[df_long['metric'].isin(valid_metrics)].copy()
                
                if not pivot_data.empty:
                    # Single-pass pivot table
                    base_pivot = pivot_data.pivot_table(
                        index=['response_id', 'brand'],
                        columns='metric',
                        values='value',
                        agg_func='mean' # Use mean to handle potential duplicates safely
                    ).reset_index()

                    # 2. Sub-Task: Task specific rescaling and storage
                    # Decoded version (original values)
                    data_store.add("pivot_scalers_decoded", base_pivot.copy())
                    base_pivot.to_excel(f"{out_dir}/pivot_scalers_decoded.xlsx", index=False)

                    # Raw/Rescaled version
                    if rescale_5_to_10:
                        rescale_cols = [c for c in rescale_5_to_10 if c in base_pivot.columns]
                        if rescale_cols:
                            base_pivot = rescale_columns(base_pivot, rescale_cols, 1, 5, new_min=1, new_max=10)
                    
                    data_store.add("pivot_scalers", base_pivot)
                    base_pivot.to_excel(f"{out_dir}/pivot_scalers.xlsx", index=False)

                else:
                    logging.getLogger(__name__).warning("No metrics from focus brands found in the Long Table. Checked metrics: %s", list(valid_metrics)[:10])
            
            except Exception as e:
                logging.getLogger(__name__).error("Phase 2: Metadata-Driven calculation failed: %s", e)
        else:
            # Fallback for legacy datasets
            logging.getLogger(__name__).warning("Metrics Long Table missing. Skipping Phase 2 optimization.")
    #######################################
    # 2. Brand Awareness and Purchase Funnel (BAPF)
    if pivots_needed.get("Brand Awareness and Purchase Funnel"):
        try:
            bapf_keys = ["tom", "unaided", "aided", "consideration", "trial", "repurchase", "mou"]
            # Identify unique question columns from project inputs
            target_cols = list(dict.fromkeys(project_inputs.get(k) for k in bapf_keys if project_inputs.get(k)))

            name_after_f_us = []   # Multi-choice (Check Box)
            value_is_the_name = [] # Single-choice (Radio/Open-ended)

            for col in target_cols:
                qtype = get_question_type(meta_data, col)
                if qtype == "Select (Check Box)":
                    name_after_f_us.append(col)
                elif qtype in ["Select (Radio Button)", "Open-end (single line)"]:
                    value_is_the_name.append(col)

            # Extract brands list for filtering results
            brands_col = project_inputs.get('brands_list')
            brands = []
            if brands_col and brands_col in codebook_df.columns:
                brands = codebook_df[brands_col].dropna().unique().tolist()

            if name_after_f_us or value_is_the_name:
                piv = pivot_choices(
                    df,
                    name_after_f_us=name_after_f_us,
                    value_is_the_name=value_is_the_name,
                    only_values=brands
                )
                data_store.add("BAPF_pivot", piv)
                piv.to_excel(f"{out_dir}/BAPF_pivot.xlsx", index=False)

        except Exception as e:
            logging.getLogger(__name__).warning("Error generating BAPF pivot: %s", e)
