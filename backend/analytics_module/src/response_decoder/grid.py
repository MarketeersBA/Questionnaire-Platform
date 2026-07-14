import re
import pandas as pd


def decode_grid(df_main, meta_data, codebook_df, meta_grids):
    if meta_data.empty or codebook_df.empty or meta_grids.empty:
        return df_main

    rename_map = {}
    for _, row in meta_grids.iterrows():
        qname = row["question_name"]
        rlist = row['row_list_parent']
        clist = row['col_parent_list']
        r_codes = codebook_df.reset_index()[["index", rlist]].dropna()
        r_codes = r_codes.set_index("index")[rlist].to_dict()
        c_codes = codebook_df.reset_index()[["index", clist]].dropna()
        c_codes = c_codes.set_index("index")[clist].to_dict()

        # Pattern to match: qname_1, qname_1_other, qname_1.digit etc.
        related_cols = [col for col in df_main.columns if col.startswith(qname)]
        pattern =re.compile(r'_r(\d+)_c(\d+)')

        for col in related_cols:
            match = pattern.search(col)
            if match:
                row_num = int(match.group(1))
                col_num = int(match.group(2))
                r_decoded = r_codes.get(row_num)
                c_decoded = c_codes.get(col_num)
                if r_decoded:
                    new_col = f"{qname}_{r_decoded}_{c_decoded}"
                    rename_map[col] = new_col

    return df_main.rename(columns=rename_map)
