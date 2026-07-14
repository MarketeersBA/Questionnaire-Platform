"""
Phase 9 QA contracts for seeded question modules.

Validates document counts, option counts, and allows_specify flags without DB.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Set

from backend.models import QuestionModuleCreate

EXPECTED_MODULE_QUESTION_COUNTS: Dict[str, int] = {
    "purchase_funnel": 7,
    "brand_usage": 4,
    "brand_pricing_behavior": 4,
}

EXPECTED_QUESTION_IDS: Dict[str, List[str]] = {
    "purchase_funnel": [f"pf_q{i}" for i in range(1, 8)],
    "brand_usage": ["us_q1", "us_q2", "us_q3", "us_q4"],
    "brand_pricing_behavior": ["cb_q1", "cb_q2", "cb_q3", "cb_q4"],
}

EXPECTED_SPECIFY_OPTIONS: Dict[str, Set[str]] = {
    "brand_usage": {"as_needed", "when_needed"},
    "brand_pricing_behavior": {"online_other", "other"},
}

def _question_ids(module: QuestionModuleCreate) -> List[str]:
    return [q.question_id for s in module.sections for q in s.questions]


def validate_module_question_counts(*modules: QuestionModuleCreate) -> None:
    by_id = {m.module_id if hasattr(m, "module_id") else None: m for m in modules}
    # modules from build_* don't set module_id on Create — validate by order
    names = ["purchase_funnel", "brand_usage", "brand_pricing_behavior"]
    for name, mod in zip(names, modules):
        qids = _question_ids(mod)
        expected_count = EXPECTED_MODULE_QUESTION_COUNTS[name]
        assert len(qids) == expected_count, f"{name}: expected {expected_count} questions, got {len(qids)}"
        assert qids == EXPECTED_QUESTION_IDS[name], f"{name}: question_id mismatch"


def validate_specify_flags(module: QuestionModuleCreate, module_id: str) -> None:
    expected_values = EXPECTED_SPECIFY_OPTIONS.get(module_id)
    if not expected_values:
        return

    found: Set[str] = set()
    for section in module.sections:
        for question in section.questions:
            for opt in question.options or []:
                if opt.allows_specify:
                    found.add(opt.value)

    assert found == expected_values, (
        f"{module_id}: allows_specify options expected {expected_values}, got {found}"
    )


def validate_option_counts(module: QuestionModuleCreate, module_id: str) -> None:
    """Ensure each MCQ/SCQ has at least the canonical option count from value maps."""
    from backend.scripts.question_module_parsers import (
        PRICING_OPTION_VALUES,
        USAGE_OPTION_VALUES,
    )

    value_maps = {
        "brand_usage": USAGE_OPTION_VALUES,
        "brand_pricing_behavior": PRICING_OPTION_VALUES,
    }.get(module_id)
    if not value_maps:
        return

    for section in module.sections:
        for question in section.questions:
            minimum = len(value_maps.get(question.question_id, {}))
            if minimum == 0:
                continue
            actual = len(question.options or [])
            assert actual >= minimum, (
                f"{module_id}/{question.question_id}: expected >= {minimum} options, got {actual}"
            )


def validate_all_seed_modules(
    pf: QuestionModuleCreate,
    usage: QuestionModuleCreate,
    pricing: QuestionModuleCreate,
) -> Dict[str, Any]:
    """Run full Phase 9 seed contract; returns summary dict."""
    validate_module_question_counts(pf, usage, pricing)
    validate_specify_flags(usage, "brand_usage")
    validate_specify_flags(pricing, "brand_pricing_behavior")
    validate_option_counts(usage, "brand_usage")
    validate_option_counts(pricing, "brand_pricing_behavior")

    return {
        "purchase_funnel": {
            "question_count": len(_question_ids(pf)),
            "question_ids": _question_ids(pf),
        },
        "brand_usage": {
            "question_count": len(_question_ids(usage)),
            "specify_options": sorted(EXPECTED_SPECIFY_OPTIONS["brand_usage"]),
        },
        "brand_pricing_behavior": {
            "question_count": len(_question_ids(pricing)),
            "specify_options": sorted(EXPECTED_SPECIFY_OPTIONS["brand_pricing_behavior"]),
        },
    }
