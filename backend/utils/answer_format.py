"""Shared answer formatting for exports and analytics (Phase 9)."""
from __future__ import annotations

from typing import Any, List


def format_module_answer(val: Any) -> str:
    """Format a module answer for Excel export, including specify round-trips."""
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(_format_single(item) for item in val)
    return _format_single(val)


def _format_single(val: Any) -> str:
    if isinstance(val, dict):
        other = val.get("otherText")
        if other is not None and str(other).strip():
            return str(other).strip()
        if "value" in val:
            return str(val.get("value") or "")
        return str(val)
    return str(val)


def serialize_specify_answer(value: str, other_text: str) -> dict:
    """Canonical specify payload for storage round-trip tests."""
    return {"value": value, "otherText": other_text.strip()}


def parse_specify_list(items: List[Any]) -> List[str]:
    """Extract display strings from MCQ answers (strings + specify objects)."""
    return [format_module_answer(item) for item in items]
