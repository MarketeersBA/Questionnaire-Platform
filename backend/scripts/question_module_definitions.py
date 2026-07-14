"""
Canonical module definitions for DB seeding.

Purchase funnel content mirrors frontend/src/constants/purchaseFunnel.ts
with pf_q1–pf_q7 IDs and analytical_role tags.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.models import (
    ModuleBrandPipeline,
    ModuleQuestion,
    ModuleSection,
    QuestionModuleCreate,
)

# Legacy aw_/pb_ IDs → pf_q* (for brand_pipeline source remapping)
LEGACY_PF_ID_MAP: Dict[str, str] = {
    "aw_q1": "pf_q1",
    "aw_q2": "pf_q2",
    "aw_q3": "pf_q3",
    "pb_q1": "pf_q4",
    "pb_q2": "pf_q5",
    "pb_q3": "pf_q6",
    "pb_q4": "pf_q7",
}

_PURCHASE_FUNNEL_SOURCE: List[Dict[str, Any]] = [
    {
        "legacy_id": "aw_q1",
        "question_id": "pf_q1",
        "section": "awareness",
        "section_title_en": "Brand Awareness",
        "section_title_ar": "الوعي بالعلامة التجارية",
        "section_order": 1,
        "label": "Top of Mind",
        "type": "open_single",
        "analytical_role": "tom",
        "ar_text": "إيه هى أول ماركة [Category] اللى تخطر على بالك؟",
        "en_text": "What is the first [Category] brand that comes to your mind?",
        "order": 1,
    },
    {
        "legacy_id": "aw_q2",
        "question_id": "pf_q2",
        "section": "awareness",
        "section_title_en": "Brand Awareness",
        "section_title_ar": "الوعي بالعلامة التجارية",
        "section_order": 1,
        "label": "Unaided Awareness",
        "type": "open_loop",
        "analytical_role": "unaided",
        "ar_text": "ايه هى الماركات التانية اللى حضرتك تعرفها في [Category]؟",
        "en_text": "What other [Category] brands do you know?",
        "has_stop": True,
        "brand_pipeline": {"mode": "exclude_prior", "sources": ["aw_q1"]},
        "order": 2,
    },
    {
        "legacy_id": "aw_q3",
        "question_id": "pf_q3",
        "section": "awareness",
        "section_title_en": "Brand Awareness",
        "section_title_ar": "الوعي بالعلامة التجارية",
        "section_order": 1,
        "label": "Aided Awareness",
        "type": "mcq",
        "analytical_role": "aided",
        "ar_text": "طيب ايه من الماركات دي تعرفها؟",
        "en_text": "Which of these brands are you familiar with?",
        "brand_pipeline": {"mode": "exclude_prior", "sources": ["aw_q1", "aw_q2"]},
        "order": 3,
    },
    {
        "legacy_id": "pb_q1",
        "question_id": "pf_q4",
        "section": "purchase_behaviour",
        "section_title_en": "Purchase Behaviour",
        "section_title_ar": "سلوك الشراء",
        "section_order": 2,
        "label": "Consideration",
        "type": "mcq",
        "analytical_role": "consideration",
        "ar_text": "ايه هى الماركات اللى ممكن تاخدها في اعتبارك وانت بتختار تشتري [Product]؟",
        "en_text": "Which brands would you consider when choosing to buy [product]?",
        "has_other": True,
        "order": 4,
    },
    {
        "legacy_id": "pb_q2",
        "question_id": "pf_q5",
        "section": "purchase_behaviour",
        "section_title_en": "Purchase Behaviour",
        "section_title_ar": "سلوك الشراء",
        "section_order": 2,
        "label": "Used Last 12 Months",
        "type": "mcq",
        "analytical_role": "bought_12m",
        "ar_text": "أيه من الماركات دي استخدمتها خلال السنة اللى فاتت / ال 12 شهر اللي فاتوا؟",
        "en_text": "Which of these brands have you used in the past year / last 12 months?",
        "has_other": True,
        "brand_pipeline": {"mode": "include_prior", "sources": ["pb_q1"], "strategy": "cascade"},
        "order": 5,
    },
    {
        "legacy_id": "pb_q3",
        "question_id": "pf_q6",
        "section": "purchase_behaviour",
        "section_title_en": "Purchase Behaviour",
        "section_title_ar": "سلوك الشراء",
        "section_order": 2,
        "label": "Used Last 3 Months",
        "type": "mcq",
        "analytical_role": "bought_3m",
        "ar_text": "طيب، ايه هى الماركات اللى حضرتك استخدمتها خلال ال3 أشهر اللى فاتوا؟",
        "en_text": "Which brands have you used in the past three months?",
        "has_other": True,
        "brand_pipeline": {"mode": "include_prior", "sources": ["pb_q2"], "strategy": "cascade"},
        "order": 6,
    },
    {
        "legacy_id": "pb_q4",
        "question_id": "pf_q7",
        "section": "purchase_behaviour",
        "section_title_en": "Purchase Behaviour",
        "section_title_ar": "سلوك الشراء",
        "section_order": 2,
        "label": "Most Often Used",
        "type": "scq",
        "analytical_role": "mou",
        "ar_text": "ايه هى اكثر ماركة [Category] حضرتك بتستخدمها في الأغلب؟",
        "en_text": "Which brand do you use most regularly?",
        "brand_pipeline": {"mode": "include_prior", "sources": ["pb_q3"], "strategy": "cascade"},
        "order": 7,
    },
]


def _remap_pipeline_sources(sources: List[str]) -> List[str]:
    return [LEGACY_PF_ID_MAP.get(s, s) for s in sources]


def _build_pipeline(raw: Optional[Dict[str, Any]]) -> Optional[ModuleBrandPipeline]:
    if not raw:
        return None
    return ModuleBrandPipeline(
        mode=raw["mode"],
        sources=_remap_pipeline_sources(raw.get("sources") or []),
        strategy=raw.get("strategy"),
    )


def build_purchase_funnel_module() -> QuestionModuleCreate:
    section_meta: Dict[str, Dict[str, Any]] = {}
    section_questions: Dict[str, List[ModuleQuestion]] = {}

    for raw in _PURCHASE_FUNNEL_SOURCE:
        sid = raw["section"]
        if sid not in section_meta:
            section_meta[sid] = {
                "section_id": sid,
                "title_en": raw["section_title_en"],
                "title_ar": raw["section_title_ar"],
                "order": raw["section_order"],
            }
            section_questions[sid] = []

        section_questions[sid].append(
            ModuleQuestion(
                question_id=raw["question_id"],
                label=raw["label"],
                type=raw["type"],
                ar_text=raw["ar_text"],
                en_text=raw["en_text"],
                order=raw["order"],
                required=True,
                analytical_role=raw.get("analytical_role"),
                brand_pipeline=_build_pipeline(raw.get("brand_pipeline")),
                has_stop=raw.get("has_stop", False),
                has_other=raw.get("has_other", False),
            )
        )

    sections = [
        ModuleSection(
            section_id=meta["section_id"],
            title_en=meta["title_en"],
            title_ar=meta["title_ar"],
            order=meta["order"],
            questions=sorted(section_questions[meta["section_id"]], key=lambda q: q.order),
        )
        for meta in sorted(section_meta.values(), key=lambda m: m["order"])
    ]

    return QuestionModuleCreate(
        name="Purchase Funnel Module",
        description=(
            "Brand awareness and purchase funnel (TOM, unaided, aided, "
            "consideration, 12m, 3m, MOU). Question IDs pf_q1–pf_q7."
        ),
        sections=sections,
    )


def build_brand_usage_module(section: ModuleSection) -> QuestionModuleCreate:
    return QuestionModuleCreate(
        name="Brand Usage Module",
        description="Category usage habits: recency, frequency, timing, and occasion (us_q1–us_q4).",
        sections=[section],
    )


def build_brand_pricing_behavior_module(section: ModuleSection) -> QuestionModuleCreate:
    return QuestionModuleCreate(
        name="Brand Pricing Behavior Module",
        description=(
            "Category purchase behavior: budget, stocking, channels, and pack size "
            "(cb_q1–cb_q4)."
        ),
        sections=[section],
    )
