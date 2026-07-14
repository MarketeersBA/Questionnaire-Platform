import json
import re
import time
from pathlib import Path
from typing import Dict, Any, List, Counter, Optional, Iterable
import numpy as np
import pandas as pd
from openai import APIConnectionError, OpenAI

from backend.analytics_module.config_loader import require_openai_api_key
from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.common import select_target_columns, get_question_type as _get_question_type, parse_llm_json
from backend.analytics_module.src.config.settings import (
    EXCLUDE_VALUES, LLM_MAX_CONNECTION_RETRIES, LLM_MAX_JSON_RETRIES, LLM_BASE_DELAY_SECONDS,
)
from backend.analytics_module.src.common.pivot_maker import normalize_one_hot_to_rows

def mc_value_percentages(df, column, base_on_appearance=False):
    """
    Multiple-choice (check box) percentages.
    base_on_appearance=False: denominator = all rows (whole data).
    base_on_appearance=True: denominator = rows that had a value (question was shown) per option.
    """
    cols = [
        col for col in df.columns
        if col.startswith(column) and not col.endswith("_other") and "_" in col
    ]

    counts = {}
    for col in cols:
        key = col.split('_')[1]
        not_na = ~df[col].isna()
        selected = (df[col] != 0) & not_na
        counts[key] = selected.sum()
    data = pd.DataFrame.from_dict(counts, orient='index', columns=[column])

    if base_on_appearance:
        denominators = {col.split('_')[1]: (~df[col].isna()).sum() for col in cols}
        denom = pd.Series(denominators).reindex(data.index, fill_value=0).replace(0, np.nan)
        data[column] = (data[column] / denom).fillna(0)
    else:
        total = len(df)
        data[column] = data[column] / total
    return data


def sc_value_percentages(df, column, base_on_appearance=False):
    """
    Single-choice (radio) percentages.
    base_on_appearance=False: denominator = all rows (whole data).
    base_on_appearance=True: denominator = rows that had a value (question was shown).
    """
    s = df[column]
    if isinstance(s, pd.DataFrame):
        s = s.iloc[:, 0]
    data = s.value_counts(sort=False, dropna=True).to_frame(name=column)
    total = s.notna().sum() if base_on_appearance else len(s)
    if total == 0:
        return data
    data = data / total
    return data


def auto_bins_n(series, n_bins):
    bins = np.linspace(series.min(), series.max(), n_bins + 1)
    labels = [f"{int(bins[i])}-{int(bins[i + 1])}" for i in range(len(bins) - 1)]
    return bins, labels


def numeric_bins(df, column):
    """Process numeric data by creating bins and counting values in ranges.

    Returns proportions (0-1) in a DataFrame whose column is named after
    ``column``, matching the output contract of ``sc_value_percentages`` and
    ``mc_value_percentages`` so that chart population code treats all question
    types uniformly.
    """
    s = df[column]
    if isinstance(s, pd.DataFrame):
        s = s.iloc[:, 0]
    # Drop NaN before binning so the denominator reflects answered rows
    s = s.dropna()
    bins, labels = auto_bins_n(s, n_bins=6)

    df_range = pd.DataFrame()
    df_range['range'] = pd.cut(s, bins=bins, labels=labels, right=True)

    range_counts = df_range['range'].value_counts().sort_index()
    total = range_counts.sum()
    if total > 0:
        range_counts = range_counts / total  # convert to proportions

    # Name the column after the question (same convention as sc/mc functions)
    result = range_counts.to_frame(name=column)
    return result


def value_percentages(df, meta_data, column, meta_grids=None, base_on_appearance=False):
    question_type = get_question_type(meta_data, column) if column else None
    data = pd.DataFrame()
    if column is None:
        return data
    elif question_type == 'Select (Radio Button)':
        data = sc_value_percentages(df, column, base_on_appearance=base_on_appearance)
    elif question_type == 'Select (Check Box)':
        data = mc_value_percentages(df, column, base_on_appearance=base_on_appearance)
    elif question_type == 'Numeric':
        data = numeric_bins(df, column)
    elif question_type == 'Open-end (single line)':
        data = sc_value_percentages(df, column, base_on_appearance=base_on_appearance)
    elif question_type is None and meta_grids is not None:
        if not meta_grids.empty and column in meta_grids['question_name'].values: # GRID
            pivdf = normalize_one_hot_to_rows(df, brand_after_s_us=[column])
            brand_base = pivdf.dropna()["brand"].value_counts()
            data = grid_stats2(df, prefixes=[f"{column}"], brand_base=brand_base)['brand_attr_rating']

    data.index = data.index.set_names("index")
    data = data[~data.index.astype(str).isin(EXCLUDE_VALUES)]
    return data.fillna(0)


get_question_type = _get_question_type


def perc_of_all_values(data, meta_data, column, ignore_values=None, spec_values=None, base_on_appearance=False):
    percentages = value_percentages(data, meta_data, column, base_on_appearance=base_on_appearance)
    return percentages


def perc_of_all_values_total(data, meta_data, columns_list, meta_grids=None, base_on_appearance=False):
    """
    Calculate percentages for a total metric by summing multiple columns.
    columns_list: list of actual column names (already resolved from project_inputs keys)
    """
    # Ensure columns_list is a list, not a DataFrame
    if isinstance(columns_list, pd.DataFrame):
        raise ValueError("columns_list must be a list, not a DataFrame")
    if not isinstance(columns_list, list) or len(columns_list) == 0:
        return pd.DataFrame()
    
    total_series = None
    for col_name in columns_list:
        tmp = value_percentages(data, meta_data, col_name, meta_grids, base_on_appearance=base_on_appearance)
        if tmp.empty:
            continue
        # Handle both Series and DataFrame returns
        if isinstance(tmp, pd.DataFrame):
            tmp_series = tmp.iloc[:, 0]
        else:
            tmp_series = tmp
        
        if total_series is None:
            total_series = tmp_series.copy()
        else:
            # Align indices before adding
            total_series = total_series.add(tmp_series, fill_value=0)
    
    if total_series is None:
        return pd.DataFrame()
    
    return total_series.to_frame(name="value")


_parse_llm_json = parse_llm_json


def build_purpose_instructions(purpose: str) -> str:
    purpose = (purpose or "").lower()

    if "improve" in purpose or "improv" in purpose:
        return """
The answers represent *improvement suggestions*.
Rules:
- Interpret all answers as requests for changes.
- Categories must be **directional and actionable**.
- Do NOT group opposite meanings together.
- Examples of category names: "Increase sweetness", "Reduce sweetness",
  "Improve packaging durability", "Increase availability", etc.
- No positive-only categories.
"""

    if "dislike" in purpose or "issue" in purpose or "problem" in purpose:
        return """
The answers represent *dislikes or issues*.
Rules:
- All categories must reflect **negative feedback or problems**.
- Direction allowed (e.g., "Too sweet", "Price is too high", "Poor availability").
- No positive reframing.
"""

    if "like" in purpose or "strength" in purpose:
        return """
The answers represent *things consumers like*.
Rules:
- All categories must be **positive**.
- Do not reframe answers into improvements.
- No directional wording like "increase", "decrease".
- Category names should reflect product strengths (e.g., "Good taste", "Affordable price").
"""

    # Fallback: neutral classification
    return """
Classify the answers into meaningful themes.
Rules:
- Keep categories neutral but clear.
- No directional assumptions unless explicitly stated in the answer.
"""


def build_prompt(answers, purpose_instructions, max_categories=10):
    return f"""
You are a senior market research analyst. Your job is to classify open-ended
survey answers into clear, meaningful categories.

{purpose_instructions}

General Rules:
- Categories are in English
- Maximum {max_categories} categories.
- Each category must be precise and non-contradictory.
- Provide:
    - category (string)
    - percentage (float)
    - 2–4 example answers
- Percentages must sum to 100.
- Order Decently by percentage
- Output VALID JSON ONLY in this exact structure:

[
  {{
    "category": "string",
    "Percentage": float,
    "examples": ["...", "..."]
  }}
]

Here are the answers:
{json.dumps(answers, ensure_ascii=False)}
"""


def _open_end_component_slug(purpose: str) -> str:
    p = (purpose or "").lower()
    if "improve" in p or "improv" in p:
        return "improvements"
    if "dislike" in p:
        return "dislikes"
    if "like" in p:
        return "likes"
    return "open_end"


def _safe_filename_part(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", (s or "").strip())[:120] or "x"


def _open_end_send_to_api_enabled(project_inputs: Optional[Dict[str, Any]]) -> bool:
    if not project_inputs:
        return True
    v = project_inputs.get("open_end_send_to_api")
    if v is None:
        return True
    if isinstance(v, str):
        return v.lower() not in ("0", "false", "no", "off")
    return bool(v)


def _write_open_end_prompt_file(
    project_inputs: Optional[Dict[str, Any]],
    purpose: str,
    visual_id: Optional[str],
    column: str,
    prompt: str,
) -> Optional[Path]:
    base = Path(project_inputs.get("output_dir") or ".") if project_inputs else Path(".")
    comp = (project_inputs or {}).get("_current_comparator")
    comp_part = ""
    if comp:
        comp_part = "_" + _safe_filename_part("_".join(str(c) for c in comp))
    slug = _open_end_component_slug(purpose)
    vid = _safe_filename_part(visual_id or "table")
    out_dir = base / "open_end_prompts"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{slug}_{vid}{comp_part}.txt"
    header = (
        f"# taste_test_open_end\n"
        f"# component={slug}\n# visual_id={visual_id}\n# column={column}\n"
        f"# send_to_api={_open_end_send_to_api_enabled(project_inputs)}\n\n"
    )
    path.write_text(header + prompt, encoding="utf-8")
    return path


def ai_percentages(
    df,
    column,
    purpose="",
    model="gpt-4o-mini",
    project_inputs=None,
    visual_id=None,
    client=None,
):
    """
    Takes a column of open-end text responses and returns a structured
    percented classification using an OpenAI LLM.

    When ``project_inputs["open_end_send_to_api"]`` is false, the prompt is
    still written under ``<output_dir>/open_end_prompts/`` and this returns [].

    Returns list of dicts:
      [
      {"category": "...", "percentage": ..., "examples": [...]},
      ...
    ]
    """

    # 1) Extract clean answers
    answers = (
        df.get(column, pd.Series(0, index=df.index))
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )

    if len(answers) == 0:
        return []

    purpose_instructions = build_purpose_instructions(purpose)
    prompt = build_prompt(answers, purpose_instructions)
    _write_open_end_prompt_file(project_inputs, purpose, visual_id, str(column), prompt)

    if not _open_end_send_to_api_enabled(project_inputs):
        return []

    if client is None:
        client = OpenAI(api_key=require_openai_api_key())

    last_error = None
    structured = None

    for json_attempt in range(LLM_MAX_JSON_RETRIES):
        response = None
        for attempt in range(LLM_MAX_CONNECTION_RETRIES):
            try:
                t0 = time.perf_counter()
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": registry.get_god_prompt()},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=1500,
                    response_format={"type": "json_object"} if "gpt-4o" in model else None
                )
                duration_ms = (time.perf_counter() - t0) * 1000
                api_cost.add_from_openai_response("ai_percentages", model, response, duration_ms=duration_ms)
                break
            except APIConnectionError as e:
                last_error = e
                if attempt == LLM_MAX_CONNECTION_RETRIES - 1:
                    raise
                delay = LLM_BASE_DELAY_SECONDS * (2 ** attempt)
                time.sleep(delay)

        text = (response.choices[0].message.content or "").strip()

        # 4) Parse JSON safely (with extraction from markdown/code blocks)
        try:
            structured = _parse_llm_json(text)
            break
        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            if json_attempt == LLM_MAX_JSON_RETRIES - 1:
                raise ValueError("LLM did not return valid JSON after {} attempts:\n{}".format(LLM_MAX_JSON_RETRIES, text))
            delay = LLM_BASE_DELAY_SECONDS * (2 ** json_attempt)
            time.sleep(delay)

    return structured


def perc_of_values(data, column, value_list=None):
    if column not in data.columns:
        return None
    match_count = data[column].isin(value_list).sum()
    return match_count / len(data)


def grid_stats2(
        df: pd.DataFrame,
        prefixes: List[str],
        brand_base = None,
        brands_filter: Optional[List[str]] = None,
) -> Dict[str, pd.DataFrame]:
    """
    Do ONE combined run over all columns whose names start with any of `prefixes`.
    Expected column pattern per match:
        <prefix><attribute>_<brand>   (e.g., 'fit_slim_Nike')

    Returns a dict with:
      - summary
      - expected
      - deviation
      - normalized_deviation
      - std_residuals
      - std_residuals_in_units
      - brand_attr_rating
    """

    # 1) Collect all target columns in one pass
    # prefixes = list(dict.fromkeys(prefixes))  # dedupe, keep order
    target_cols = [
        c for c in df.columns
        if any(c.startswith(p + "_") for p in prefixes) and c.count("_") == 2
    ]
    if not target_cols:
        empty = pd.DataFrame()
        return {
            "summary": empty, "expected": empty, "deviation": empty,
            "normalized_deviation": empty, "std_residuals": empty,
            "std_residuals_in_units": empty, "brand_attr_rating": empty
        }

    # 2) Melt once
    long_df = (
        df[target_cols]
        .copy()
        .melt(ignore_index=True, var_name="col", value_name="checked")
    )

    # 3) Extract prefix, attribute, brand from the column names in one shot
    # Build a safe alternation for prefixes (escaped, longest first to avoid greedy partials)
    prefixes_sorted = sorted(prefixes, key=len, reverse=True)
    alt = "|".join(re.escape(p) for p in prefixes_sorted)
    # ^(?P<prefix>(p1|p2|...))(?P<attribute>[^_]+)_(?P<brand>[^_]+)$
    pat = re.compile(
        r'^(?P<prefix>[^_]+)_(?P<attribute>[^_]+)_(?P<brand>[^_]+)$'
    )
    extracted = long_df["col"].str.extract(pat)
    if extracted.isna().any().any():
        bad = long_df.loc[extracted.isna().any(axis=1), "col"].unique()[:5]
        raise ValueError(
            "Some columns do not match the expected '<prefix>_<attribute>_<brand>' pattern. "
            f"Examples: {bad!r}"
        )

    long_df = pd.concat([long_df, extracted], axis=1)

    if brands_filter is not None:
        brands_set = set(brands_filter)
        long_df = long_df[long_df["brand"].isin(brands_set)]

    long_df['checked'] = pd.to_numeric(long_df['checked'], errors='coerce')

    # 2️⃣ Keep only rows where checked is a valid number
    df_valid = long_df[long_df['checked'] == 1]

    # 3️⃣ Pivot table: count checks
    summary = pd.pivot_table(
        df_valid,
        index='brand',
        columns='attribute',
        values='checked',
        aggfunc='count',
        fill_value=0
    )

    # Drop "Exclusive"/"None" brands, all-zero columns/rows
    summary = summary.drop(
        index=[i for i in summary.index if "Exclusive" in str(i) or "None" in str(i)],
        errors="ignore"
    )

    summary = summary.loc[:, ~(summary == 0).all(axis=0)]
    summary = summary.loc[~(summary == 0).all(axis=1)]

    total_checks = int(summary.values.sum()) if not summary.empty else 0
    # 6) Expected counts under independence (single computation)
    if total_checks == 0 or summary.empty:
        expected = summary.copy() * 0
    else:
        brand_prop = summary.sum(axis=1) / total_checks
        attr_prop = summary.sum(axis=0) / total_checks
        expected_np = np.outer(brand_prop.to_numpy(), attr_prop.to_numpy()) * total_checks
        expected = pd.DataFrame(expected_np, index=summary.index, columns=summary.columns)

    # 7.1) Deviations
    deviation = summary.copy() - expected

    # 7.2) Normalization
    ## column wise:
    # normalized_deviation = deviation.subtract(deviation.min(axis=0), axis=1) if not deviation.empty else deviation
    normalized_deviation = deviation.subtract(deviation.mean(axis=0), axis=1) if not deviation.empty else deviation
    ## not columns wise:
    # normalized_deviation = deviation - deviation.min().min() if not deviation.empty else deviation

    # 8) Standardized residuals
    with np.errstate(divide="ignore", invalid="ignore"):
        # std_residuals = normalized_deviation / normalized_deviation.std(axis=0)
        # std_residuals = (deviation - deviation.mean(axis=0)) / deviation.std(axis=0)
        # std_residuals = (summary - expected) / np.sqrt(expected.replace(0, np.nan))
        col_std = deviation.std(axis=0).replace(0, np.nan)
        std_residuals = normalized_deviation / col_std

    std_residuals = std_residuals.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    sd_units_df = std_residuals.round().astype(int) if not std_residuals.empty else std_residuals

    # 9) Ratings using brand_base once over the combined summary
    brand_attribute_rating = summary.div(pd.Series(brand_base), axis=0).dropna(how="all")

    outputs = {
        "summary": summary,
        "expected": expected,
        "deviation": deviation,
        "normalized_deviation": normalized_deviation,
        "std_residuals": std_residuals,
        "std_residuals_in_units": sd_units_df,
        "brand_attr_rating": brand_attribute_rating,
    }

    return outputs


def unaided_value_percentages(df, prefix):
    def count_unaided_values(df, prefix):
        # Select only columns that match pattern like Unaidedawareness_1, Unaidedawareness_2, etc.
        pattern = re.compile(rf'^{re.escape(prefix)}')
        target_cols = select_target_columns(df.columns, pattern)
        # Flatten all values from the selected columns into a single list
        all_values = df[target_cols].values.ravel()
        # Filter out NaN, empty strings, or zeros if needed
        cleaned_values = [str(v).strip() for v in all_values if
                          pd.notna(v) and str(v).strip() != '' and v != 0 and v != "nan" and v != 1]
        return Counter(cleaned_values)

    """Process unaided awareness data."""

    counts = count_unaided_values(df, prefix)
    counts_df = pd.DataFrame.from_dict(counts, orient='index', columns=['count'])
    total = len(df)
    counts_df[prefix] = (counts_df["count"] / total).round(2)
    counts_df = counts_df.sort_values(by="count", ascending=False)
    counts_df.drop("count", axis=1, inplace=True)
    return counts_df


def reshape_grouped_result(tmp, value_name=None):
    """
    Generalized reshaping for grouped.apply output.
    Works whether tmp is:
    - Series with MultiIndex        → unstack
    - DataFrame with 1 column       → convert to Series then unstack
    - Series with single index      → return DataFrame with one column
    """

    # Case 1: DataFrame with a single column --> make it Series
    if isinstance(tmp, pd.DataFrame):
        if tmp.shape[1] == 1:
            tmp = tmp.iloc[:, 0]
        else:
            raise ValueError("Expected DataFrame with one column")

    # Now tmp is a Series
    index_levels = tmp.index.nlevels

    if index_levels == 2:
        # MultiIndex → unstack the 2nd level
        df = tmp.unstack(level=1)
        return df

    elif index_levels == 1:
        # Single index → return as DataFrame
        name = value_name or tmp.name or "value"
        return tmp.to_frame(name)

    else:
        raise ValueError("Unsupported number of index levels")


def apply_filters_df(df: pd.DataFrame, flt: Dict[str, Any], names: Dict[str, Any]) -> pd.DataFrame:
    if df is None or df.empty or not flt:
        return df

    column = flt["column"]
    op = flt.get("op", "==")
    raw_target = flt.get("value")
    target = names.get(raw_target, raw_target)
    s = df[column] if column in df.columns else pd.Series([None] * len(df), index=df.index)

    if op == "in":
        target_list = target if isinstance(target, list) else (target or [])
        mask = s.isin(target_list)

    elif op == "==":
        # When value resolves to a list (e.g. my_brands), treat as "in" semantics
        if isinstance(target, list):
            mask = s.isin(target)
        else:
            mask = s.eq(target)

    elif op == "!=":
        mask = s.ne(target)

    else:
        raise ValueError(f"Unsupported op: {op}")

    return df[mask]


def run_measure(
    data,
    meta_data,
    function_name,
    arg_keys,
    context=None,
    meta_grids=None,
    metric=None,
    visual_id=None,
    client=None,
    model=None,
):
    FUNCTIONS = {
        "perc_of_values": perc_of_values,
        "perc_of_all_values": perc_of_all_values,
        "perc_of_all_values_total": perc_of_all_values_total,
        "ai_percentages": ai_percentages,
    }

    func = FUNCTIONS[function_name]

    # Convert argument names to actual Python objects
    resolved_args = []
    
    # Process arg_keys - handle the case where arg_keys might be a list containing a list
    # For perc_of_all_values_total, arg_keys is [["col1", "col2"]] - we want the inner list as ONE argument
    if function_name == "perc_of_all_values_total" and len(arg_keys) == 1 and isinstance(arg_keys[0], list):
        # Unwrap the outer list for totals: [["col1", "col2"]] -> treat ["col1", "col2"] as single argument
        columns_list = arg_keys[0]
        # Resolve each column key in the list
        resolved_list = []
        for col_key in columns_list:
            # Try to resolve from project_inputs (context)
            if context and col_key in context:
                resolved_col = context[col_key]
                # Ensure we get a string, not a DataFrame or other object
                if isinstance(resolved_col, (pd.DataFrame, pd.Series)):
                    raise ValueError(f"Column key '{col_key}' resolved to a DataFrame/Series, expected a string column name")
                resolved_list.append(str(resolved_col))
            else:
                resolved_list.append(str(col_key))
        resolved_args.append(resolved_list)
    else:
        # For other functions, process arguments normally
        for arg in arg_keys:
            if isinstance(arg, list):
                # Check if this is a list of numbers (for perc_of_values value_list) or column keys
                # If all elements are numbers, keep as-is (don't resolve)
                # Otherwise, treat as column keys to resolve
                if all(isinstance(x, (int, float)) for x in arg):
                    # This is a numeric list (e.g., [9, 10] for perc_of_values), keep as-is
                    resolved_args.append(arg)
                else:
                    # This is a list of column keys, resolve each element
                    resolved_list = []
                    for col_key in arg:
                        if context and col_key in context:
                            resolved_col = context[col_key]
                            if isinstance(resolved_col, (pd.DataFrame, pd.Series)):
                                raise ValueError(f"Column key '{col_key}' resolved to a DataFrame/Series, expected a string column name")
                            resolved_list.append(str(resolved_col))
                        else:
                            resolved_list.append(str(col_key))
                    resolved_args.append(resolved_list)
            elif context and arg in context:
                resolved_val = context[arg]
                # Ensure we get a string for column names
                if isinstance(resolved_val, (pd.DataFrame, pd.Series)):
                    raise ValueError(f"Argument '{arg}' resolved to a DataFrame/Series, expected a string")
                resolved_args.append(resolved_val)
            else:
                resolved_args.append(arg)  # literal value or already resolved column name
    
    # Add meta_data and meta_grids in the correct positions based on function signature
    if function_name == "perc_of_all_values":
        # perc_of_all_values(data, meta_data, column, ...)
        # resolved_args should be [column], we need [meta_data, column]
        resolved_args.insert(0, meta_data)
    elif function_name == "perc_of_all_values_total":
        # perc_of_all_values_total(data, meta_data, columns_list, meta_grids=None)
        # resolved_args should be [columns_list], we need [meta_data, columns_list, meta_grids]
        # For totals, resolved_args should contain one list element
        if not resolved_args or not isinstance(resolved_args[0], list):
            raise ValueError(f"Expected resolved_args[0] to be a list for perc_of_all_values_total, got {type(resolved_args[0]) if resolved_args else 'empty'}. resolved_args: {resolved_args}")
        resolved_args.insert(0, meta_data)
        resolved_args.append(meta_grids)

    # HERE: data is injected automatically as the first parameter
    if function_name in ("perc_of_all_values", "perc_of_all_values_total") and metric is not None:
        base = metric.get("base_on_appearance", False)
        return func(data, *resolved_args, base_on_appearance=base)
    if function_name == "ai_percentages":
        return func(data, *resolved_args, project_inputs=context, visual_id=visual_id, client=client, model=model)
    return func(data, *resolved_args)


def build_percentages(data_store=None, item=None, project_inputs=None, meta_data=None, 
                      focus_brands=None, my_brands=None, meta_grids=None, visual_id=None,
                      client=None, model=None):
    """
    Unified function that handles both chart_data and metrics formats.
    
    Internally converts chart_data to metrics format for unified processing.
    Both formats are now supported and produce the same results.
    """
    
    # Handle Filter field at top level (for unified format)
    if 'Filter' in item and item.get('Filter'):
        filter_value = item['Filter']
        if filter_value.lower() == "focus_brands":
            item['_filter_brands'] = focus_brands or []
        elif filter_value.lower() == "my_brand":
            item['_filter_brands'] = my_brands or []
        elif filter_value == "top10_brands":
            item['Limit'] = 10
    
    # Now process using unified metrics format
    if 'metrics' in item:
        data_source = item.get('data', 'decoded_raw_data')
        data = data_store.get(data_source).copy()
        flt = item.get("filter")
        filtered = apply_filters_df(data, flt, project_inputs)
        group_by = item.get('group_by')
        pieces = []
        
        if group_by:
            for key, metric in item['metrics'].items():
                function_name = metric['function']
                args = metric['args']
                grouped = filtered.groupby(group_by)

                out = grouped.apply(
                    lambda g: run_measure(
                        g,
                        meta_data,
                        function_name,
                        args,
                        project_inputs,
                        meta_grids=meta_grids,
                        metric=metric,
                        visual_id=visual_id,
                        client=client,
                        model=model,
                    ),
                    include_groups=False
                )
                if not out.empty:
                    out = reshape_grouped_result(out, key)  # ensures metric column(s) are named with `key`
                pieces.append(out)

        else:
            for key, metric in item['metrics'].items():
                function_name = metric['function']
                args = metric['args']
                result = run_measure(
                    filtered,
                    meta_data,
                    function_name,
                    args,
                    project_inputs,
                    meta_grids=meta_grids,
                    metric=metric,
                    visual_id=visual_id,
                    client=client,
                    model=model,
                )
                
                # Handle different return types
                if isinstance(result, pd.DataFrame):
                    if result.shape[1] == 1:
                        # Single column DataFrame -> rename to metric name
                        result.columns = [key]
                        tmp = result
                    else:
                        # Multi-column DataFrame -> use as is
                        tmp = result
                elif isinstance(result, pd.Series):
                    # Series -> convert to DataFrame with metric name
                    tmp = result.to_frame(name=key)
                elif isinstance(result, list):
                    # List of dicts (from ai_percentages) -> convert to DataFrame
                    tmp = pd.DataFrame(result) if result else pd.DataFrame()
                elif isinstance(result, (int, float)):
                    # Scalar value (e.g., from perc_of_values) -> convert to DataFrame
                    tmp = pd.DataFrame({key: [result]}, index=[0])
                else:
                    tmp = pd.DataFrame()
                
                pieces.append(tmp)

        # combine all metrics into one tmp
        valid_pieces = [p for p in pieces if not p.empty]
        if not valid_pieces:
            return pd.DataFrame()
            
        tmp = valid_pieces[0].copy()
        for p in valid_pieces[1:]:
            # Join DataFrames on index (outer join to keep all rows)
            tmp = tmp.join(p, how="outer", rsuffix='_dup')
            # Remove duplicate columns if any
            tmp = tmp.loc[:, ~tmp.columns.str.endswith('_dup')]
            tmp = tmp.fillna(0)

        # Handle Order_By and sort_order (asc/desc; default desc for backward compatibility)
        sort_ascending = (item.get("sort_order", "desc") or "desc").lower() == "asc"
        if item.get("Order_By"):
            order_col = item["Order_By"]
            # Check if it's a column key that needs resolution
            if order_col in project_inputs:
                order_col = project_inputs[order_col]
            # Check if it's a direct column name
            if order_col in tmp.columns:
                tmp.sort_values(by=order_col, ascending=sort_ascending, inplace=True)
            else:
                # Try to find it in the index or use first numeric column
                if tmp.index.name == order_col or order_col in tmp.index:
                    tmp.sort_index(ascending=sort_ascending, inplace=True)
                else:
                    first_numeric = tmp.select_dtypes(include='number').columns[0] if not tmp.select_dtypes(include='number').empty else tmp.columns[0]
                    tmp.sort_values(by=first_numeric, ascending=sort_ascending, inplace=True)

        # Handle brand filtering (from chart_data Filter)
        if item.get("_filter_brands"):
            brand_list = item["_filter_brands"]
            if isinstance(brand_list, list) and len(brand_list) > 0:
                # Filter by index (brand names)
                available_brands = [b for b in brand_list if b in tmp.index]
                if available_brands:
                    tmp = tmp[tmp.index.isin(available_brands)]

        if item.get("Limit"):
            tmp = tmp[:(item["Limit"])]

        new_order = item.get("order_columns", tmp.columns)
        if isinstance(new_order, list):
            # Reorder columns that match order_columns; keep any extra columns from data so we don't drop columns due to label mismatch
            matched = [c for c in new_order if c in tmp.columns]
            extra = [c for c in tmp.columns if c not in new_order]
            final_cols = matched + extra
            if final_cols:
                tmp = tmp.loc[:, final_cols]

        # Handle special section transformations
        if item.get('section') == "Brand Analyzer":
            tmp = tmp.T

        # Clean data
        tmp = tmp.copy()
        tmp.replace([np.nan, np.inf, -np.inf], pd.NA, inplace=True)
        tmp.fillna(0, inplace=True)

        # Handle special visual_id cases
        if visual_id and visual_id.lower() == "pf_table":

            if 'MOU' in tmp.columns:
                tmp['MOU'] = tmp['MOU'].astype(float)

            if 'Trial' in tmp.columns and 'Total Awareness' in tmp.columns:
                tmp['Attractiveness Ratio'] = (
                    tmp['Trial'] / tmp['Total Awareness'].replace(0, np.nan)
                ).fillna(0).astype(float)

            if 'Repurchase' in tmp.columns and 'Trial' in tmp.columns:
                tmp['Conversion Ratio'] = (
                    tmp['Repurchase'] / tmp['Trial'].replace(0, np.nan)
                ).fillna(0).astype(float)

            if 'MOU' in tmp.columns and 'Repurchase' in tmp.columns:
                tmp['Loyalty Ratio'] = (
                    tmp['MOU'] / tmp['Repurchase'].replace(0, np.nan)
                ).fillna(0).astype(float)



        return pd.DataFrame(tmp)
    
    else:
        raise ValueError("Item must have either 'chart_data' or 'metrics' field")
