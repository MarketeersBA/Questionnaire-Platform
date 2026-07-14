import pandas as pd
import numpy as np

def decode_radio_questions(data_df, questions_df, codebook_df, create_new_columns=True):
    # Work on a copy so original is not modified
    decoded_df = data_df.copy()

    if questions_df.empty or codebook_df.empty:
        return decoded_df

    radio_questions = questions_df[questions_df["question_type"] == "Select (Radio Button)"].copy()
    if radio_questions.empty:
        return decoded_df

    radio_questions["effective_list"] = radio_questions.apply(
        lambda row: row["list_name"] if pd.isna(row.get("parent_list")) else row.get("parent_list"),
        axis=1
    )
    radio_questions = radio_questions[["question_name", "effective_list"]].dropna()
    
    if radio_questions.empty:
        return decoded_df
    # Prepare codebook: normalize first column name to 'code' and convert to numeric
    codebook_clean = codebook_df.copy()
    first_col = codebook_clean.columns[0]
    codebook_clean = codebook_clean.rename(columns={first_col: "code"})
    # convert code to numeric, coerce errors -> NaN, drop those rows
    codebook_clean["code"] = pd.to_numeric(codebook_clean["code"], errors="coerce")
    codebook_clean = codebook_clean.dropna(subset=["code"])
    # keep codes as integers when possible (but keep numeric dtype)
    codebook_clean["code"] = codebook_clean["code"].astype(int)

    # For each radio question, build a numeric-keyed mapping and map after coercing data column to numeric
    for _, row in radio_questions.iterrows():
        col_name = row["question_name"]
        list_name = row["effective_list"]

        if list_name not in codebook_clean.columns:
            # list not found in codebook - skip (or log)
            continue

        # clean labels: replace textual 'nan' with real NaN
        labels = codebook_clean[[ "code", list_name ]].copy()
        labels[list_name] = labels[list_name].replace(r'^\s*nan\s*$', np.nan, regex=True)

        # drop rows where label is NaN (no label defined)
        mapping_series = labels.dropna(subset=[list_name])
        # create numeric-keyed mapping (int -> label)
        mapping_dict = dict(zip(mapping_series["code"].astype(int), mapping_series[list_name]))

        # find matching columns: exact match (single) or repeated (col_name.1, col_name.2...)
        matching_columns = [c for c in data_df.columns if c == col_name or c.startswith(f"{col_name}.")]
        for match_col in matching_columns:
            # coerce the data column to numeric so  "1", "1.0", 1.0 all become numeric 1
            temp_numeric = pd.to_numeric(data_df[match_col], errors="coerce")
            # map using numeric keys
            mapped = temp_numeric.map(mapping_dict)

            # if create_new_columns:
            #     decoded_col_name = f"{match_col}_decoded"
            # else:
            #     decoded_col_name = match_col  # overwrite original (use with caution)

            decoded_df[match_col] = mapped

            # Optional debugging info (comment out in production)
            # unmapped_count = temp_numeric.isna().sum() + (~temp_numeric.isin(mapping_dict.keys())).sum()
            # print(f"Column {match_col}: unique values before mapping -> {data_df[match_col].unique()}")
            # print(f"Mapping keys -> {sorted(mapping_dict.keys())}")
            # print(f"Unmapped rows (resulting NaN) -> {decoded_df[decoded_col_name].isna().sum()}")

    return decoded_df

