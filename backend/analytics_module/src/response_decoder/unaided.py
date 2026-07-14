from __future__ import annotations
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Dict, List, Union, Generator, Tuple, Any

import pandas as pd

from backend.analytics_module.src.common import select_target_columns, PRICES_PER_TOKEN

PRICES = PRICES_PER_TOKEN


# -----------------------
# Helpers: regex & columns
# -----------------------

def compile_regex(pattern: Union[str, re.Pattern], case_insensitive: bool) -> re.Pattern:
    if isinstance(pattern, re.Pattern):
        return pattern
    flags = re.IGNORECASE if case_insensitive else 0
    return re.compile(pattern, flags)


# -----------------------
# Helpers: values & cleanup
# -----------------------

def extract_values(df, target_cols: List[str]) -> List[str]:
    """Pulls non-null string values from the target columns, stripped."""
    vals: List[str] = []
    for c in target_cols:
        col = df[c].dropna().astype(str)
        vals.extend(v.strip() for v in col)
    return vals


def dedupe_values_preserve_order(values: Iterable[str]) -> List[str]:
    """Casefold-based dedupe while keeping first appearance."""
    seen = set()
    out: List[str] = []
    for v in values:
        key = v.casefold().strip()
        if key and key not in seen:
            seen.add(key)
            out.append(v.strip())
    return out


def maybe_limit(values: List[str], max_variants: int | None) -> List[str]:
    return values if not max_variants else values[:max_variants]


def chunk_iterable(seq: List[Any], chunk_size: int) -> Generator[List[Any], None, None]:
    for i in range(0, len(seq), chunk_size):
        yield seq[i: i + chunk_size]


# -----------------------
# Helpers: prompting & parsing
# -----------------------

def build_system_prompt(prompt) -> str:
    return prompt


def build_user_prompt(variants: Iterable[str], brands, prompt: str) -> str:
    brand_list = "\n".join(f"- {b}" for b in brands)
    response_list = "\n".join(f"- {v}" for v in variants)

    return (
            prompt +
            "Focus brands:\n"
            f"{brand_list}\n\n"
            "Variants (survey responses):\n"
            f"{response_list}"
    )


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def add(self, other: "Usage"):
        self.prompt_tokens += other.prompt_tokens
        self.completion_tokens += other.completion_tokens

    def cost_usd(self, input_rate_per_million: float, output_rate_per_million: float) -> float:
        return (
                (self.prompt_tokens) * input_rate_per_million +
                (self.completion_tokens) * output_rate_per_million
        )


def call_llm_json(
        client,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
):
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    text = resp.choices[0].message.content
    usage = getattr(resp, "usage", None)
    if usage is None:
        prompt_tokens = completion_tokens = 0
    elif isinstance(usage, dict):
        # old style
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
    else:
        # new style (object with attributes)
        prompt_tokens = getattr(usage, "prompt_tokens", 0)
        completion_tokens = getattr(usage, "completion_tokens", 0)

    usage_data = Usage(prompt_tokens, completion_tokens)

    try:
        parsed = parse_model_json(text)
    except Exception:
        parsed = {"Unknown": [text.strip()]}

    return parsed, usage_data


def parse_model_json(text: str) -> Dict[str, List[str]]:
    """Strict JSON parse and normalization to Dict[str, List[str]]."""
    try:
        data = json.loads(text)
    except Exception as e:
        raise ValueError(f"Model output was not valid JSON: {e}\nRaw output:\n{text}") from e

    if not isinstance(data, dict):
        raise ValueError(f"Model returned a non-object JSON value.\nRaw output:\n{text}")

    normalized: Dict[str, List[str]] = {}
    for k, v in data.items():
        if isinstance(v, list):
            normalized[k] = [str(x).strip() for x in v if str(x).strip()]
        else:
            # if a single string/object sneaks in, coerce to singleton list
            normalized[k] = [str(v).strip()]

    return normalized


# -----------------------
# Helpers: merging results
# -----------------------

def merge_mappings(base: Dict[str, List[str]], new: Dict[str, List[str]]) -> Dict[str, List[str]]:
    """Merge new into base, deduping per key case-insensitively while preserving order."""
    for canon, variants in new.items():
        existing = base.setdefault(canon, [])
        seen_local = {x.casefold() for x in existing}
        for v in variants:
            if v.casefold() not in seen_local:
                existing.append(v)
                seen_local.add(v.casefold())
    return base


# -----------------------
# Outer function: orchestrator
# -----------------------

def ai_brand_map(
        df,
        pattern: Union[str, re.Pattern],
        client,
        brands: Iterable[str] = None,
        use_search: bool = False,
        case_insensitive: bool = True,
        max_variants=None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.,
        max_output_tokens: int = 2048,
        chunk_size: int = 600,
        target_cols=None,
        system_prompt_input: str = "",
        user_prompt_input: str = ""
) -> Tuple[Dict[str, List[str]], Dict[str, Any]]:
    """
    Build a JSON mapping from canonical brand -> [variants] using an LLM.

    Steps:
      1) Compile regex & select columns
      2) Extract/clean values, early-dedupe, optional limit
      3) Chunk variants to keep prompts small
      4) For each chunk, call LLM and parse JSON
      5) Merge partial maps into a final mapping

    Returns: Python dict (canonical -> list of variants).
    Raises ValueError if the model output in any chunk is not valid JSON.
    """

    # 1) Columns
    if pattern:
        rx = compile_regex(pattern, case_insensitive)
        target_cols = select_target_columns(df.columns, rx, use_search)

    if not target_cols:
        return {}, {}

    # 2) Values
    raw_values = extract_values(df, target_cols)
    cleaned = list({v.strip().casefold() for v in raw_values if v.strip()})
    cleaned = maybe_limit(cleaned, max_variants)
    if not cleaned:
        return {}, {}

    # 3) Prepare prompts (system is static)
    system_prompt = build_system_prompt(system_prompt_input)

    price = PRICES.get(model, {"input": 0.0, "output": 0.0})
    total_usage = Usage()

    # 4) Chunk, call model, merge
    final_map: Dict[str, List[str]] = {}
    for chunk in chunk_iterable(cleaned, chunk_size):
        user_prompt = build_user_prompt(chunk, brands, user_prompt_input)
        partial, usage = call_llm_json(
            client=client,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_output_tokens,
        )
        merge_mappings(final_map, partial)
        total_usage.add(usage)

    total_cost = total_usage.cost_usd(price["input"], price["output"])

    usage_summary = {
        "prompt_tokens": total_usage.prompt_tokens,
        "completion_tokens": total_usage.completion_tokens,
        "total_cost_usd": round(total_cost, 6),
        "model": model,
    }

    return final_map, usage_summary


###########################################################################################
###########################################################################################

def decode_unaided_values(df, pattern, brand_map):
    pattern = re.compile(pattern)

    target_cols = [col for col in df.columns if pattern.match(col)]

    # new_pattern = r'^[^A-Za-z0-9\u0600-\u06FF]+|[^A-Za-z0-9\u0600-\u06FF]+$'

    # Apply to multiple columns
    df[target_cols] = df[target_cols].apply(
        lambda col: col.astype(str)
        .str.casefold()
        .str.strip()  # remove spaces at start/end
        # .str.replace(new_pattern, '', regex=True)  # remove special chars at start/end
        # .str.strip()  # remove any spaces left after removal
    )

    reverse_map = {variant: correct for correct, variants in brand_map.items() for variant in variants}

    df[target_cols] = df[target_cols].apply(lambda col: col.map(reverse_map).fillna(col))

    return df


def map_brand_names(df, client, model, brands, columns):
    unaided_tom_pattern = f"^(?:{'|'.join(columns)})"
    system_prompt = ("You are an expert data cleaner specializing in brand names. "
                     "Given a list of survey response variants, you will map them to their canonical brand names. "
                     "Respond only with a JSON object mapping canonical brand names to lists of variants. "
                     "If a variant does not match any known brand, map it to 'Unknown'."
                     )

    user_prompt = (
        "Context:\n"
        "You are given free-text responses from a consumer survey. These are answers to Top-of-Mind "
        "and Unaided Brand Awareness questions — people type whatever brand name they recall.\n\n"

        "Task:\n"
        "Return a JSON object that maps each CORRECT ENGLISH brand name to an array of all variants "
        "that refer to that brand.\n\n"

        "Rules:\n"
        f"• Start with the following {len(brands)} brand names as your initial set of keys. Include all of them in the output (empty arrays allowed).\n"
        "• Only create a NEW brand key if a response clearly refers to a different, real brand not in the list.\n"
        "• Group misspellings, transliterations, phonetic variants, abbreviations, and spacing/punctuation variants under the correct brand.\n"
        "• Every response must appear in exactly one array.\n"
        "• if the response includes multiple brands, pick the first mentioned one.\n"
        "• If a response clearly doesn't map to any brand, put it under \"unknown\".\n"
        "• Every response listed below must appear in exactly one array — do not skip or lose any."
        "• Do not include commentary, explanations, or markdown — output JSON only.\n\n"
    )
    brand_map, usage_summary = ai_brand_map(df,
                                            pattern=unaided_tom_pattern,
                                            brands=brands,
                                            client=client,
                                            model=model,
                                            temperature=0.1,
                                            chunk_size=250,
                                            system_prompt_input=system_prompt,
                                            user_prompt_input=user_prompt)

    # brand_map.pop('unknown', None)
    # brand_map.pop('Unknown', None)
    return brand_map, usage_summary


def collapse_unaided_columns(
        df: pd.DataFrame,
        prefix: str = "Unaided",
        sep: str = "_",
        allowed_values=None
) -> pd.DataFrame:
    """
    Convert multiple Unaided columns into binary one-hot columns.
    Optionally restrict encoding to allowed_values only.

    """

    # detect unaided columns
    unaided_cols = [c for c in df.columns if c.startswith(prefix)]
    if not unaided_cols:
        return df

    src = df[unaided_cols]

    # extract unique non-null values
    values = src.stack().dropna().unique()

    # filter by allow-list if provided
    if allowed_values is not None:
        allowed_set = set(allowed_values)
        values = [v for v in values if v in allowed_set]

    if not values:
        return df.drop(columns=unaided_cols)

    # build all binary columns at once
    encoded = pd.DataFrame(
        {
            f"{prefix}{sep}{val}": src.eq(val).any(axis=1).astype(int)
            for val in values
        },
        index=df.index
    )

    # drop original columns + concat new ones
    return pd.concat(
        [df.drop(columns=unaided_cols), encoded],
        axis=1
    )


