import json
import re
from pathlib import Path

import pandas as pd

from backend.analytics_module.src.common import select_target_columns
from .checkbox import decode_checkbox_columns
from .loops import decode_loops
from .radio import decode_radio_questions
from .unaided import decode_unaided_values, ai_brand_map, map_brand_names, collapse_unaided_columns
from .grid import decode_grid

def fix_awareness_after_collapse_unaided(df, column_names):
    pass

def fix_awareness_before_collapse_unaided(df, column_names):
    aid_pattern = re.compile(f"^{column_names['aided']}")
    unaid_pattern = re.compile(f"^{column_names['unaided']}")
    tom_pattern = re.compile(f"^{column_names['tom']}")

    aided_cols = select_target_columns(df.columns, aid_pattern)
    unaided_cols = select_target_columns(df.columns, unaid_pattern)
    tom_cols = select_target_columns(df.columns, tom_pattern)

    for i, row in df.iterrows():
        for col in aided_cols:
            b = col.split("_")[1]
            if b in row[tom_cols].values or b in row[unaided_cols].values:
                df.loc[i, col] = 0

        unaided_positions = []
        for c in unaided_cols:
            loc = df.columns.get_indexer_for([c])
            unaided_positions.extend(loc)
        for pos in unaided_positions:
            if row.iloc[pos] in row[tom_cols].values:
                df.iat[i, pos] = 0


def run(df, meta_data, codebook_df, meta_grids, names, client, MODEL, out_dir=None):
    df = decode_radio_questions(df, meta_data, codebook_df)
    df = decode_checkbox_columns(df, meta_data, codebook_df)
    df = decode_grid(df, meta_data, codebook_df, meta_grids)
    df = decode_loops(df, meta_data, codebook_df)
    ########### HANDLE UNAIDED ####################################################################
    handle_unaided_with_ai = names.get('handle_unaided_with_ai', False)
    brand_map = {}
    unaided_col = names.get('unaided')
    tom_col = names.get('tom')
    
    # Feature Guard: Disable AI mapping if no target columns are mapped
    if not unaided_col or not tom_col:
        handle_unaided_with_ai = False

    if handle_unaided_with_ai:
        brands = []
        if not codebook_df.empty and names.get('brands_list') in codebook_df.columns:
            brands = codebook_df[names['brands_list']].dropna().tolist()

        if brands:
            brand_map, usage_summary = map_brand_names(df,
                                                       client,
                                                       MODEL,
                                                       brands,
                                                       [unaided_col, tom_col]
                                                       )
    
            with open(out_dir + "/map.json", "w", encoding="utf-8") as f:
                json.dump(brand_map, f, ensure_ascii=False, indent=4)
    
            try:
                from backend.analytics_module.src.ai import api_cost
                api_cost.add_from_usage_summary("decoder", usage_summary)
            except Exception:
                pass

    elif names.get('unaided_json_path', None):
        with open(names.get('unaided_json_path'), "r", encoding="utf-8") as f:
            brand_map = json.load(f)

    if brand_map and unaided_col and tom_col and not codebook_df.empty and names.get('brands_list') in codebook_df.columns:
        brands = codebook_df[names['brands_list']].dropna().tolist()
        df = decode_unaided_values(df, pattern=f"^(?:{'|'.join([unaided_col, tom_col])})", brand_map=brand_map)
        fix_awareness_before_collapse_unaided(df, names)
        df = collapse_unaided_columns(df, prefix=unaided_col, allowed_values=brands)
        meta_data.loc[meta_data['question_name'] == unaided_col, "question_type"] = "Select (Check Box)"
        meta_data.loc[meta_data['question_name'] == tom_col, "question_type"] = "Select (Radio Button)"
    ########### ################ ####################################################################
    df.to_excel(Path(f"{out_dir}/decoded.xlsx"), index=True)
    return df
