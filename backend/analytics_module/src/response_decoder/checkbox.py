import re
import pandas as pd


def decode_checkbox_columns(df, questions_df, codebook_df):
    if questions_df.empty or codebook_df.empty:
        return df

    # Step 1: filter checkbox questions
    checkbox_qs = questions_df[questions_df["question_type"] == "Select (Check Box)"]
    if checkbox_qs.empty:
        return df

    rename_map = {}

    for _, row in checkbox_qs.iterrows():
        qname = row["question_name"]

        rlist = row['parent_list'] if pd.notna(row['parent_list']) else row['list_name']

        if pd.isna(rlist) or rlist not in codebook_df.columns:
            continue  # Skip if no valid list name found

        codes = codebook_df.reset_index()[["index", rlist]].dropna()
        codes = codes.set_index("index")[rlist].to_dict()

        # Pattern to match: qname_1, qname_1_other, qname_1.digit etc.
        pattern = re.compile(rf"^{qname}[_]?(\d+)(.*)?$")

        for col in df.columns:
            match = pattern.match(col)
            if match:
                code = int(match.group(1))
                suffix = match.group(2) or ""
                decoded = codes.get(code)
                if decoded:
                    new_col = f"{qname}_{decoded}{suffix}"
                    rename_map[col] = new_col
                    # print(col, ": ", new_col)

    return df.rename(columns=rename_map)
