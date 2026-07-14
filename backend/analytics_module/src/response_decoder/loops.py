import re


def decode_loops(df, meta_data, codebook_df):
    if meta_data.empty or codebook_df.empty:
        return df

    rename_map = {}
    for _, row in meta_data.iterrows():
        if row['loop'] is not None:
            qname = row['question_name']
            loop_list = row['loop_parent_list']
            loop_items = codebook_df.reset_index()[["index", loop_list]].dropna()
            loop_items = loop_items.set_index("index")[loop_list].to_dict()
            related_cols = [col for col in df.columns if col.startswith(qname)]
            for col in related_cols:
                match = re.search(r"\.(\d+)$", col)
                if match:
                    number = int(match.group(1))
                    item = loop_items.get(number)
                    if item:
                        new_col = col.replace(f".{number}", f".{item}")
                        # new_col = col.replace(f".{number}", f"_{item}")
                        rename_map[col] = new_col
                        # print(col, ": ", new_col)
                    else:
                        pass
                        # print(col, " can't be decoded")

                else:
                    pass
                    # print(col ," No Match")

    return df.rename(columns=rename_map)

