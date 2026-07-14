import re
import pandas as pd
from functools import reduce

def pivot_choices(
    df,
    name_after_f_us=None,
    value_is_the_name=None,
    pov=None,
    only_values=None,          # NEW: list/set of allowed values for pov (brands) or SC answers
):
    if value_is_the_name is None:
        value_is_the_name = []
    if name_after_f_us is None:
        name_after_f_us = []
    if pov is None:
        pov = "brand"

    allowed = None
    if only_values is not None:
        allowed = set(only_values)

    # Keep old index as response_id, but use new RangeIndex internally
    df = df.reset_index().rename(columns={"index": "response_id"})

    long_tables = []

    # ------------------------
    # MULTI-CHOICE columns
    # ------------------------
    for base in name_after_f_us:
        prefix = base + "_"
        value_cols = [c for c in df.columns if c.startswith(prefix)]
        if not value_cols:
            continue

        tmp = df.melt(
            id_vars="response_id",
            value_vars=value_cols,
            var_name="tmp",
            value_name=base,
        )
        tmp[pov] = tmp["tmp"].str.replace(prefix, "", n=1, regex=False)
        tmp = tmp.drop(columns=["tmp"])

        # NEW: keep only allowed pov values (brands) if provided
        if allowed is not None:
            tmp = tmp[tmp[pov].isin(allowed)]

        long_tables.append(tmp)

    if not long_tables:
        return pd.DataFrame(columns=["response_id", pov] + name_after_f_us + value_is_the_name)

    merged = reduce(
        lambda a, b: pd.merge(a, b, on=["response_id", pov], how="outer"),
        long_tables,
    )

    # drop rows where all multi-choice values are NaN
    measure_cols = [b for b in name_after_f_us if b in merged.columns]
    if measure_cols:
        merged = merged.dropna(subset=measure_cols, how="all")

    # ------------------------
    # SINGLE-CHOICE columns
    # ------------------------
    for col in value_is_the_name:
        sc_long = df[["response_id", col]].copy()
        sc_long = sc_long.rename(columns={col: pov})
        sc_long = sc_long.dropna(subset=[pov])

        # NEW: keep only allowed SC answers (which become pov) if provided
        if allowed is not None:
            sc_long = sc_long[sc_long[pov].isin(allowed)]

        sc_long[col] = 1

        merged = merged.merge(sc_long, on=["response_id", pov], how="outer")
        merged[col] = merged[col].fillna(0).astype(int)

    # sort rows & columns
    merged = merged.sort_values(["response_id", pov]).reset_index(drop=True)
    merged = merged[["response_id", pov] + measure_cols + value_is_the_name]

    # remove rows that are all zero/NaN across any value columns
    value_cols = measure_cols + value_is_the_name
    if value_cols:
        mask_all_zero_or_nan = (merged[value_cols].fillna(0) == 0).all(axis=1)
        merged = merged[~mask_all_zero_or_nan]

    return merged


def normalize_one_hot_to_rows(
        df: pd.DataFrame,
        brand_after_s_us=None,  # e.g., ["perception_attr_brand1", "perception1_", "Satisfied_"]
        brand_after_dot=None,  # e.g., ["awareness.brand1", "consideration.brand2"]
        comparison_cols=None,  # e.g., ["shape1", "shape2", "size1", "size2", "outer1", "inner2"]
        comparison_map=None,  # e.g., {"1": "Abu Auf", "2": "Hero"}
        ignore_brands=None,
        additional_cols=None  # e.g., ["gender", "city", "segment"]
):
    """
    Normalize brand-grid, loop, and taste columns to long brand rows, then pivot attributes to columns.

    additional_cols:
        Columns that are per-response (same value for all brands of that response).
        They are NOT parsed; they are just carried through and merged back after pivot.
    """
    if brand_after_s_us is None:
        brand_after_s_us = []
    if brand_after_dot is None:
        brand_after_dot = []
    if comparison_cols is None:
        comparison_cols = []
    if additional_cols is None:
        additional_cols = []

    if ignore_brands is None:
        ignore_brands = {"None", "Other (specify)", "ولا واحدة [Exclusive]"}

    # Ensure response_id exists
    if "response_id" not in df.columns:
        df = df.copy()
        df = df.rename_axis("response_id").reset_index()

    # --- 1) Collect candidate columns (ONLY the ones that encode brand/attribute)
    def is_grid_col(col: str) -> bool:
        return any(col.startswith(pfx) for pfx in brand_after_s_us)

    def is_loop_col(col: str) -> bool:
        return any((col.startswith(f"{lp}") and "." in col and "_other" not in col for lp in brand_after_dot))

    def is_taste_col(col: str) -> bool:
        # taste_cols are given as explicit column names
        return col in comparison_cols

    selected_cols = [
        c for c in df.columns
        if is_grid_col(c) or is_loop_col(c) or is_taste_col(c)
    ]
    if not selected_cols:
        # Still add additional_cols if present
        base_cols = ["response_id"] + additional_cols
        return df[base_cols].drop_duplicates(subset=["response_id"])

    # --- 2) Build parsing map: column -> (attribute, brand)
    parsed_rows = []
    for col in selected_cols:
        attribute = ""
        brand = ""

        if is_grid_col(col):
            # Format: <Prefix>_<Attribute>_<Brand> or <Attribute>_<Brand>
            parts = col.split("_")
            if len(parts) >= 3:
                # Common grid format: Q1_r1_c1
                attribute = parts[1]
                brand = "_".join(parts[2:])
            elif len(parts) == 2:
                # Attribute_Brand
                attribute = parts[0]
                brand = parts[1]
            else:
                continue

        elif is_loop_col(col):
            # Split on first dot: <loop>.<brand>
            dot_pos = col.find(".")
            if dot_pos != -1:
                attribute = col[:dot_pos]  # loop name is the attribute
                brand = col[dot_pos + 1:]
            else:
                continue

        elif is_taste_col(col):
            # Support both numeric IDs (Attribute1) and String Brands (Attribute_Brand)
            # Pattern 1: Attribute_Brand (with underscore)
            if "_" in col:
                attribute, brand = col.rsplit("_", 1)
            else:
                # Pattern 2: AttributeDigit (Legacy)
                m = re.match(r"^(.*?)(\d+)$", col)
                if m:
                    attribute = m.group(1)
                    brand = m.group(2)
                else:
                    # Pattern 3: Treat whole column as attribute, brand as "All"
                    attribute = col
                    brand = "Global"

            # Map brand_id/name to normalized name if comparison_map is provided
            if comparison_map is not None:
                brand = comparison_map.get(brand, brand)

        parsed_rows.append((col, attribute.strip(), brand.strip()))

    if not parsed_rows:
        base_cols = ["response_id"] + additional_cols
        return df[base_cols].drop_duplicates(subset=["response_id"])

    mapping_df = pd.DataFrame(parsed_rows, columns=["col", "attribute", "brand_from_col"])

    # --- 3) Melt and attach mapping
    long = (
        df.melt(
            id_vars=["response_id"],  # ONLY response_id as ID here
            value_vars=[c for c, *_ in parsed_rows],
            var_name="col",
            value_name="raw_value",
        )
        .merge(mapping_df, on="col", how="left")
    )

    # --- 4) Filter out ignored brands
    long["brand_from_col"] = long["brand_from_col"].astype(str).str.strip()
    long = long[~long["brand_from_col"].isin(ignore_brands)]

    out = (
        long.assign(brand=long["brand_from_col"])
        .pivot(index=["response_id", "brand"], columns="attribute", values="raw_value")
        .reset_index()
        .rename_axis(None, axis=1)
    )

    # Flatten columns if pivot left a MultiIndex
    if isinstance(out.columns, pd.MultiIndex):
        out.columns = [c if isinstance(c, str) else c[-1] for c in out.columns]

    # --- 5) Attach additional_cols (same for all brands of the response)
    if additional_cols:
        meta = df[["response_id"] + additional_cols].drop_duplicates(subset=["response_id"])
        out = out.merge(meta, on="response_id", how="left")

    return out
