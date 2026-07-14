"""Shared utilities used across multiple packages."""

import re
import json
from typing import Iterable, List, Dict, Any, Optional


def select_target_columns(columns: Iterable[str], rx: re.Pattern, use_search: bool = False) -> List[str]:
    """Select DataFrame columns matching a compiled regex pattern."""
    if use_search:
        return [c for c in columns if rx.search(c)]

    target_cols = []
    seen = set()
    for col in columns:
        if rx.match(col) and col not in seen:
            seen.add(col)
            target_cols.append(col)

    return target_cols


def get_question_type(meta_data, column) -> Optional[str]:
    """Look up the question_type for a given column name in meta_data DataFrame."""
    if isinstance(column, str):
        row = meta_data[meta_data['question_name'] == column]
        if not row.empty:
            return row.iloc[0]['question_type']
    return None


def parse_llm_json(text: str) -> Any:
    """Extract and parse JSON from LLM output, handling markdown code fences."""
    if not text:
        raise ValueError("Empty response")
    stripped = text.strip()
    for pattern in (r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", r"^```(?:json)?\s*\n?(.*)$"):
        m = re.search(pattern, stripped, re.DOTALL)
        if m:
            stripped = m.group(1).strip()
            break
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    # Extract first [...] or {...} block
    for open_ch, close_ch in [("[", "]"), ("{", "}")]:
        start = stripped.find(open_ch)
        end = stripped.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(stripped[start: end + 1])
            except json.JSONDecodeError:
                pass
    raise ValueError("No valid JSON found in response")


PRICES_PER_TOKEN: Dict[str, Dict[str, float]] = {
    # Pricing: input | cached_input (50% of input) | output
    "gpt-4.1":      {"input": 5.00  / 1_000_000, "cached_input": 2.50  / 1_000_000, "output": 15.00 / 1_000_000},
    "gpt-4.1-mini": {"input": 0.40  / 1_000_000, "cached_input": 0.20  / 1_000_000, "output": 1.60  / 1_000_000},
    "gpt-4o":       {"input": 2.50  / 1_000_000, "cached_input": 1.25  / 1_000_000, "output": 10.00 / 1_000_000},
    "gpt-4o-mini":  {"input": 0.150 / 1_000_000, "cached_input": 0.075 / 1_000_000, "output": 0.600 / 1_000_000},
}
