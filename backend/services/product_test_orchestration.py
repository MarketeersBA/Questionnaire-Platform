"""
Product test orchestration helpers — language resolution, config normalization,
and timing-phase snapshot composition (mirrors frontend productTestSnapshotBuilder).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.services.product_test_visibility_conditions import apply_recommend_visibility_conditions

PRODUCT_TEST_TIMING_PHASES = ("before_use", "during_use", "after_use", "packaging")

BANK_TIMING_TO_PHASE: Dict[str, str] = {
    "Before Use": "before_use",
    "During Use": "during_use",
    "After Use": "after_use",
}

PHASE_LABELS: Dict[str, Dict[str, str]] = {
    "before_use": {"en": "Before Use", "ar": "قبل الاستخدام"},
    "during_use": {"en": "During Use", "ar": "أثناء الاستخدام"},
    "after_use": {"en": "After Use", "ar": "بعد الاستخدام"},
    "packaging": {"en": "Packaging & Presentation", "ar": "التعبئة والتغليف"},
}

GROUP_NAME_TRANSLATIONS = {
    "Product Appearance": "مظهر المنتج",
    "Preparation & Usage": "التحضير والاستخدام",
    "Core Performance": "الأداء الأساسي",
    "Sensory & After-Use Experience": "الحسية وتجربة ما بعد الاستخدام",
    "Convenience & Practicality": "الراحة والعملية",
}

STANDALONE_SECTION_ID = "overall_product_evaluation"
PACKAGING_SECTION_ID = "packaging_presentation"

DEFAULT_CATEGORY_EN = "Category"
DEFAULT_CATEGORY_AR = "الفئة"
DEFAULT_BRAND_EN = "product"
DEFAULT_BRAND_AR = "المنتج"


def resolve_brand_display_name(
    brand_key: str,
    *,
    testing_protocol: str = "branded",
    blind_codes: Optional[Dict[str, str]] = None,
) -> str:
    """Resolve respondent-facing brand label (branded name or blind sample code)."""
    trimmed = (brand_key or "").strip()
    if not trimmed:
        return ""

    if testing_protocol == "blind" and blind_codes:
        code = (blind_codes.get(trimmed) or "").strip()
        if code:
            return code

    return trimmed


def build_brand_scoped_question_id(brand: str, bank_question_id: str) -> str:
    """Build stable scoped id: `{brand}_{bankQuestionId}`."""
    brand_part = (brand or "").strip()
    question_part = (bank_question_id or "").strip()
    if not brand_part:
        return question_part
    if not question_part:
        return brand_part
    prefix = f"{brand_part}_"
    if question_part.startswith(prefix):
        return question_part
    return f"{brand_part}_{question_part}"


def apply_product_test_placeholders(
    text: str,
    *,
    brand: str,
    category: Optional[str] = None,
    attribute: str = "",
    language: str = "en",
    testing_protocol: str = "branded",
    blind_codes: Optional[Dict[str, str]] = None,
) -> str:
    """
  Single source of truth for product-test copy substitution (mirrors FE engine).
  """
    if not text:
        return ""

    is_arabic = language == "ar"
    resolved_category = (category or "").strip() or (DEFAULT_CATEGORY_AR if is_arabic else DEFAULT_CATEGORY_EN)
    resolved_attribute = (attribute or "").strip()
    brand_display = resolve_brand_display_name(
        brand,
        testing_protocol=testing_protocol,
        blind_codes=blind_codes,
    )
    brand_fallback = brand_display or (DEFAULT_BRAND_AR if is_arabic else DEFAULT_BRAND_EN)

    result = text

    # Explicit bracket / brace tokens
    result = re.sub(r"\[\s*Brand\s*\]", brand_display, result, flags=re.IGNORECASE)
    result = re.sub(r"\{\s*brand\s*\}", brand_display, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*brand\s*\]", brand_display, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*Product\s*\]", brand_display, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*product\s*\]", brand_display, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*Category\s*\]", resolved_category, result, flags=re.IGNORECASE)
    result = re.sub(r"\{\s*category\s*\}", resolved_category, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*category\s*\]", resolved_category, result, flags=re.IGNORECASE)
    result = re.sub(r"\[\s*Attribute\s*\]", resolved_attribute, result, flags=re.IGNORECASE)

    # Arabic brand tokens
    result = result.replace("(البراند)", brand_display)
    result = result.replace("البراند", brand_display or "البراند")

    # Arabic product tokens
    result = result.replace("(المنتج)", brand_display)
    result = result.replace("المنتج", brand_display or "المنتج")
    result = result.replace("منتج", brand_display or "منتج")

    # English generic product word (last)
    result = re.sub(r"product", brand_fallback, result, flags=re.IGNORECASE)

    return result


def build_product_test_brand_context(
    *,
    brands: Optional[List[str]] = None,
    own_brand: Optional[str] = None,
    category: Optional[str] = None,
    testing_protocol: str = "branded",
    blind_codes: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Normalize Parameters-stage brand input into snapshot brand_context."""
    deduped: List[str] = []
    seen = set()
    for name in brands or []:
        trimmed = (name or "").strip()
        if trimmed and trimmed not in seen:
            seen.add(trimmed)
            deduped.append(trimmed)

    protocol = testing_protocol if testing_protocol in ("branded", "blind") else "branded"
    return {
        "brands": deduped,
        "own_brand": (own_brand or "").strip() or None,
        "category": (category or "").strip() or DEFAULT_CATEGORY_EN,
        "testing_protocol": protocol,
        "blind_codes": blind_codes or {},
    }


def resolve_orchestration_language(survey_data: Dict[str, Any]) -> str:
    """
    Resolve the language the survey schema is composed in.

    Precedence follows the survey's TYPE, not a fixed config order. It used to
    read `product_test_config.language` first for every survey, which broke
    Arabic taste tests: switching survey type in the wizard leaves the old
    `product_test_config` on the form (defaulting to "en"), so a taste test
    explicitly set to Arabic still composed in English. The question text is
    baked into `template_snapshot_schema` at creation, so respondents then saw
    English permanently — nothing at render time could recover it.
    """
    config = survey_data.get("config") or {}
    pt_config = survey_data.get("product_test_config") or {}
    tt_config = survey_data.get("taste_test_config") or {}

    survey_type = (survey_data.get("type") or "").strip().lower()
    modules = set(survey_data.get("selected_modules") or [])
    modules.update(survey_data.get("module_sequence") or [])
    is_product_test = survey_type == "product_test" or "product_test" in modules

    # The config belonging to this survey's own type wins; the others are only
    # consulted as a fallback so surveys with no type-specific config still work.
    if is_product_test:
        ordered = (pt_config, tt_config, config)
    else:
        ordered = (tt_config, config, pt_config)

    for candidate in ordered:
        language = (candidate or {}).get("language")
        if language:
            return language

    return "en"


def resolve_orchestration_category(survey_data: Dict[str, Any]) -> str:
    """Resolve product/category label for placeholder substitution."""
    config = survey_data.get("config") or {}
    tt_config = survey_data.get("taste_test_config") or {}
    return (
        config.get("category")
        or tt_config.get("category")
        or "Category"
    )


def resolve_product_test_fixed_question_ids(
    pt_config: Dict[str, Any],
    all_pt_questions: List[Dict[str, Any]],
) -> List[str]:
    """
    Ensure fixed_questions lists all bank fixed IDs when config omits them.
    Mirrors frontend schemaComposer staticFixedIds fallback.
    """
    configured = pt_config.get("fixed_questions") or []
    if configured:
        return list(configured)
    return [
        q["question_id"]
        for q in all_pt_questions
        if q.get("question_status") == "fixed" and q.get("question_id")
    ]


def normalize_product_test_config(
    pt_config: Dict[str, Any],
    all_pt_questions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Return a copy of pt_config with fixed_questions populated when empty."""
    normalized = dict(pt_config or {})
    normalized["fixed_questions"] = resolve_product_test_fixed_question_ids(
        normalized, all_pt_questions
    )
    normalized.setdefault("selected_attributes", [])
    normalized.setdefault("optional_questions", [])
    normalized.setdefault("package_test_enabled", False)
    normalized.setdefault("package_test_attributes", [])
    normalized.setdefault("packaging_heatmap_enabled", False)
    normalized.setdefault(
        "packaging_heatmap_images",
        {"front": None, "back": None},
    )
    from backend.trial_media_capture.snapshot import normalize_trial_media_capture

    normalized["trial_media_capture"] = normalize_trial_media_capture(
        normalized.get("trial_media_capture"),
    )
    return normalized


def bank_timing_to_phase(timing: Optional[str]) -> str:
    if not timing:
        return "before_use"
    return BANK_TIMING_TO_PHASE.get(timing, "before_use")


def phase_label(phase: str, language: str) -> str:
    labels = PHASE_LABELS.get(phase, PHASE_LABELS["before_use"])
    return labels.get(language, labels["en"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return (slug[:64] if slug else "section")


def _question_sort_key(question_id: str) -> int:
    return int(re.sub(r"\D", "", question_id) or 0)


def _translate_group_name(name: str, is_arabic: bool) -> str:
    if not is_arabic:
        return name
    return GROUP_NAME_TRANSLATIONS.get(name, name)


def _is_product_question_enabled(q: Dict[str, Any], pt_config: Dict[str, Any]) -> bool:
    if q.get("question_status") == "fixed":
        return True
    fixed_qids = pt_config.get("fixed_questions") or []
    optional_qids = pt_config.get("optional_questions") or []
    selected_attrs = pt_config.get("selected_attributes") or []
    if q.get("question_id") in fixed_qids or q.get("question_id") in optional_qids:
        return True
    if selected_attrs:
        if q.get("attribute") in selected_attrs:
            return True
        if q.get("parent_attribute") and q["parent_attribute"] in selected_attrs:
            return True
    return False


def _is_package_question_enabled(q: Dict[str, Any], pt_config: Dict[str, Any]) -> bool:
    if not pt_config.get("package_test_enabled"):
        return False
    pkg_attrs = pt_config.get("package_test_attributes") or []
    if not pkg_attrs:
        return True
    return q.get("attribute") in pkg_attrs


def map_bank_question_to_respondent(
    q: Dict[str, Any],
    language: str,
    phase: str,
) -> Dict[str, Any]:
    """Map a bank question document to ProductTestRespondentQuestion shape."""
    is_arabic = language == "ar"
    text = q.get("ar_text") if is_arabic and q.get("ar_text") else q.get("en_text", "")
    raw_options = q.get("ar_options") if is_arabic and q.get("ar_options") else q.get("en_options", [])

    q_type_str = (q.get("question_type") or "").lower()
    is_scale = "scale" in q_type_str
    is_numeric = "numeric" in q_type_str
    is_bipolar = "bipolar" in q_type_str
    is_open_ended = "open-end" in q_type_str or "text" in q_type_str

    scale_max = 5
    scale_match = re.search(r"(\d+)-(\d+)", q_type_str)
    if scale_match:
        scale_max = int(scale_match.group(2))
    elif "10" in q_type_str:
        scale_max = 10

    options = raw_options
    if isinstance(options, str):
        options = [o.strip() for o in options.split(",")]

    final_type = "mcq"
    if is_open_ended:
        final_type = "open-ended"
    elif is_numeric:
        final_type = "number"
    elif is_scale:
        final_type = "scale"
    elif is_bipolar:
        final_type = "bipolar"

    if final_type == "mcq" and len(options) == 1 and options[0].lower() == "open-end":
        final_type = "open-ended"
        options = []
    if final_type == "open-ended":
        options = []

    min_label = ""
    max_label = ""
    if isinstance(raw_options, str) and "=" in raw_options:
        parts = [o.strip() for o in raw_options.split(",")]
        for p in parts:
            if "=" in p:
                val, lbl = p.split("=", 1)
                if val.strip() == "1":
                    min_label = lbl.strip()
                if val.strip() == str(scale_max) or p == parts[-1]:
                    max_label = lbl.strip()

    diagnostic_tag = q.get("diagnostic_tag")

    return {
        "id": q.get("question_id"),
        "text": text,
        "type": final_type,
        "options": options or [],
        "required": True,
        "timing": phase,
        "diagnostic_tag": diagnostic_tag,
        "questionMeta": {
            "nature": "fixed" if q.get("question_status") == "fixed" else "dynamic",
            "inputType": (
                "open-ended"
                if final_type == "open-ended"
                else (
                    "numeric"
                    if is_numeric
                    else ("scale" if is_scale else ("bipolar" if is_bipolar else "single-choice"))
                )
            ),
            "options": options or [],
            "scaleMax": scale_max if is_scale else None,
            "minLabel": min_label or None,
            "maxLabel": max_label or None,
            "bipolarLeft": min_label if is_bipolar else None,
            "bipolarRight": max_label if is_bipolar else None,
            "canonicalQuestionId": q.get("question_id"),
            "diagnostic_tag": diagnostic_tag,
        },
    }


def resolve_brands_from_survey_data(survey_data: Dict[str, Any]) -> Dict[str, Any]:
    """Build brand_context from survey Parameters (mirrors FE resolveBrandContextFromFormConfig)."""
    config = survey_data.get("taste_test_config") or survey_data.get("config") or {}
    internal = survey_data.get("internal_brands_data") or config.get("internal_brands_data") or []
    competitor = survey_data.get("competitor_brands_data") or config.get("competitor_brands_data") or []

    internal_names = [b.get("name") for b in internal if b.get("name")]
    if not internal_names and config.get("own_brand"):
        internal_names = [config["own_brand"]]

    competitor_names = [b.get("name") for b in competitor if b.get("name")]
    if not competitor_names:
        competitor_names = list(config.get("competitive_brands") or [])

    return build_product_test_brand_context(
        brands=internal_names + competitor_names,
        own_brand=config.get("own_brand"),
        category=resolve_orchestration_category(survey_data),
        testing_protocol=config.get("testing_protocol", "branded"),
        blind_codes=config.get("blind_codes"),
    )


def _apply_brand_scope_to_question(
    mapped: Dict[str, Any],
    bank_question_id: str,
    brand: str,
    brand_context: Dict[str, Any],
    section_title: str,
    language: str,
) -> Dict[str, Any]:
    display_brand = resolve_brand_display_name(
        brand,
        testing_protocol=brand_context.get("testing_protocol", "branded"),
        blind_codes=brand_context.get("blind_codes"),
    )
    scoped = dict(mapped)
    scoped["id"] = build_brand_scoped_question_id(brand, bank_question_id)
    scoped["canonicalQuestionId"] = bank_question_id
    scoped["brand"] = brand
    scoped["displayBrand"] = display_brand
    scoped["text"] = apply_product_test_placeholders(
        mapped.get("text", ""),
        brand=brand,
        category=brand_context.get("category"),
        attribute=section_title,
        language=language,
        testing_protocol=brand_context.get("testing_protocol", "branded"),
        blind_codes=brand_context.get("blind_codes"),
    )
    meta = dict(scoped.get("questionMeta") or {})
    meta["canonicalQuestionId"] = bank_question_id
    scoped["questionMeta"] = meta
    return scoped


def _build_sections_for_phase(
    phase: str,
    enabled_questions: List[Dict[str, Any]],
    language: str,
    brand: Optional[str] = None,
    brand_context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    is_arabic = language == "ar"
    phase_questions = [q for q in enabled_questions if bank_timing_to_phase(q.get("timing")) == phase]

    group_map: Dict[str, List[tuple]] = {}
    standalone_qs: List[tuple] = []

    for q in phase_questions:
        mapped = map_bank_question_to_respondent(q, language, phase)
        bank_id = q.get("question_id", "")
        parent = q.get("parent_attribute")
        attr_type = q.get("attribute_type", "")
        entry = (bank_id, mapped, q)

        if parent:
            group_map.setdefault(parent, []).append(entry)
        elif attr_type == "main":
            group_map.setdefault(q.get("attribute", "General"), []).append(entry)
        else:
            standalone_qs.append(entry)

    sections: List[Dict[str, Any]] = []
    brand_slug = _slugify(brand) if brand else ""

    for group_name, entries in group_map.items():
        raw_title = _translate_group_name(group_name, is_arabic)
        title = (
            apply_product_test_placeholders(
                raw_title,
                brand=brand or "",
                category=(brand_context or {}).get("category"),
                attribute=group_name,
                language=language,
                testing_protocol=(brand_context or {}).get("testing_protocol", "branded"),
                blind_codes=(brand_context or {}).get("blind_codes"),
            )
            if brand and brand_context
            else raw_title
        )
        scoped_entries = []
        for bank_id, mapped, bank_q in entries:
            if brand and brand_context:
                scoped_entries.append((
                    bank_id,
                    _apply_brand_scope_to_question(
                        mapped, bank_id, brand, brand_context, group_name, language,
                    ),
                    bank_q,
                ))
            else:
                scoped_entries.append((bank_id, mapped, bank_q))

        questions = sorted(
            apply_recommend_visibility_conditions(
                [entry[1] for entry in scoped_entries],
                [(entry[0], entry[2]) for entry in scoped_entries],
                language,
            ),
            key=lambda x: _question_sort_key(x.get("id", "0")),
        )

        sections.append({
            "id": f"{phase}_{brand_slug}_{_slugify(group_name)}" if brand else f"{phase}_{_slugify(group_name)}",
            "title": title,
            "module": "product_test",
            "timing": phase,
            "brand": brand,
            "displayBrand": resolve_brand_display_name(
                brand,
                testing_protocol=(brand_context or {}).get("testing_protocol", "branded"),
                blind_codes=(brand_context or {}).get("blind_codes"),
            ) if brand and brand_context else None,
            "questions": questions,
        })

    if standalone_qs:
        raw_standalone = "التقييم العام للمنتج" if is_arabic else "Overall Product Evaluation"
        title = (
            apply_product_test_placeholders(
                raw_standalone,
                brand=brand or "",
                category=(brand_context or {}).get("category"),
                language=language,
                testing_protocol=(brand_context or {}).get("testing_protocol", "branded"),
                blind_codes=(brand_context or {}).get("blind_codes"),
            )
            if brand and brand_context
            else raw_standalone
        )
        scoped_standalone = []
        for bank_id, mapped, bank_q in standalone_qs:
            if brand and brand_context:
                scoped_standalone.append((
                    bank_id,
                    _apply_brand_scope_to_question(
                        mapped, bank_id, brand, brand_context, title, language,
                    ),
                    bank_q,
                ))
            else:
                scoped_standalone.append((bank_id, mapped, bank_q))

        standalone_questions = sorted(
            apply_recommend_visibility_conditions(
                [entry[1] for entry in scoped_standalone],
                [(entry[0], entry[2]) for entry in scoped_standalone],
                language,
            ),
            key=lambda x: _question_sort_key(x.get("id", "0")),
        )

        sections.append({
            "id": f"{phase}_{brand_slug}_{STANDALONE_SECTION_ID}" if brand else f"{phase}_{STANDALONE_SECTION_ID}",
            "title": title,
            "module": "product_test",
            "timing": phase,
            "brand": brand,
            "displayBrand": resolve_brand_display_name(
                brand,
                testing_protocol=(brand_context or {}).get("testing_protocol", "branded"),
                blind_codes=(brand_context or {}).get("blind_codes"),
            ) if brand and brand_context else None,
            "questions": standalone_questions,
        })

    return sections


def _build_preference_section(
    brands: List[str],
    brand_context: Dict[str, Any],
    language: str,
) -> Dict[str, Any]:
    display_options = [
        resolve_brand_display_name(
            b,
            testing_protocol=brand_context.get("testing_protocol", "branded"),
            blind_codes=brand_context.get("blind_codes"),
        )
        for b in brands
    ]
    is_arabic = language == "ar"
    return {
        "id": "product_preference",
        "title": "التفضيل" if is_arabic else "Preference",
        "module": "product_test",
        "timing": "after_use",
        "questions": [{
            "id": "pt_overall_preference",
            "text": "أي منتج تفضله أكثر؟" if is_arabic else "Which product did you prefer the most?",
            "type": "mcq",
            "options": display_options,
            "required": True,
            "timing": "after_use",
            "diagnostic_tag": None,
            "questionMeta": {
                "nature": "fixed",
                "inputType": "single-choice",
                "options": display_options,
                "brandOptions": brands,
                "canonicalQuestionId": "pt_overall_preference",
            },
        }],
    }


def _compute_snapshot_meta(phases: List[Dict[str, Any]], brand_count: int, generated_at: str) -> Dict[str, Any]:
    section_count = sum(len(p["sections"]) for p in phases)
    total_questions = sum(
        len(sec["questions"])
        for p in phases
        for sec in p["sections"]
    )
    product_question_count = sum(
        len(sec["questions"])
        for p in phases
        if p.get("timing") != "packaging"
        for sec in p["sections"]
    )
    preference_count = 1 if brand_count > 1 else 0
    per_brand_denominator = brand_count if brand_count > 0 else 1
    questions_per_brand = (
        round((product_question_count - preference_count) / per_brand_denominator)
        if brand_count > 0
        else total_questions
    )
    return {
        "totalQuestions": total_questions,
        "sectionCount": section_count,
        "phaseCount": len(phases),
        "generatedAt": generated_at,
        "brandCount": brand_count,
        "questionsPerBrand": questions_per_brand,
    }


def _build_packaging_phase(
    pt_config: Dict[str, Any],
    package_questions: List[Dict[str, Any]],
    language: str,
) -> Optional[Dict[str, Any]]:
    sections = _build_package_test_sections(pt_config, package_questions, language)
    if not sections:
        return None

    return {
        "timing": "packaging",
        "label": phase_label("packaging", language),
        "sections": sections,
    }


def _build_package_test_sections(
    pt_config: Dict[str, Any],
    package_questions: List[Dict[str, Any]],
    language: str,
) -> List[Dict[str, Any]]:
    if not pt_config.get("package_test_enabled"):
        return []

    enabled = [q for q in package_questions if _is_package_question_enabled(q, pt_config)]
    if not enabled:
        return []

    is_arabic = language == "ar"
    mapped = sorted(
        [map_bank_question_to_respondent(q, language, "packaging") for q in enabled],
        key=lambda x: _question_sort_key(x.get("id", "0")),
    )

    return [{
        "id": PACKAGING_SECTION_ID,
        "title": "تقييم التعبئة والتغليف" if is_arabic else "Packaging & Presentation Evaluation",
        "module": "package_test",
        "timing": "packaging",
        "questions": mapped,
    }]


def _compose_packaging_phase(
    pt_config: Dict[str, Any],
    package_questions: List[Dict[str, Any]],
    language: str,
    brand_context: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Merge package_test scale section and packaging_heatmap section into one phase."""
    from backend.packaging_heatmap.snapshot import build_packaging_heatmap_section

    sections: List[Dict[str, Any]] = []
    sections.extend(_build_package_test_sections(pt_config, package_questions, language))

    heatmap_section = build_packaging_heatmap_section(pt_config, brand_context, language)
    if heatmap_section:
        sections.append(heatmap_section)

    if not sections:
        return None

    return {
        "timing": "packaging",
        "label": phase_label("packaging", language),
        "sections": sections,
    }
def build_product_test_snapshot(
    pt_config: Dict[str, Any],
    product_questions: List[Dict[str, Any]],
    package_questions: List[Dict[str, Any]],
    language: str,
    generated_at: Optional[str] = None,
    brand_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build ProductTestSnapshot dict from bank questions and normalized config."""
    pt_config = normalize_product_test_config(pt_config, product_questions)
    enabled_product = [q for q in product_questions if _is_product_question_enabled(q, pt_config)]
    brands = (brand_context or {}).get("brands") or []
    generated = generated_at or datetime.now(timezone.utc).isoformat()

    phases: List[Dict[str, Any]] = []

    if not brands:
        for phase in PRODUCT_TEST_TIMING_PHASES:
            if phase == "packaging":
                continue
            sections = _build_sections_for_phase(phase, enabled_product, language)
            if not sections:
                continue
            phases.append({
                "timing": phase,
                "label": phase_label(phase, language),
                "sections": sections,
            })
    else:
        for phase in PRODUCT_TEST_TIMING_PHASES:
            if phase == "packaging":
                continue
            phase_sections: List[Dict[str, Any]] = []
            for brand in brands:
                phase_sections.extend(
                    _build_sections_for_phase(
                        phase, enabled_product, language, brand, brand_context,
                    ),
                )
            if phase_sections:
                phases.append({
                    "timing": phase,
                    "label": phase_label(phase, language),
                    "sections": phase_sections,
                })

        if len(brands) > 1 and brand_context:
            after_phase = next((p for p in phases if p["timing"] == "after_use"), None)
            if after_phase:
                after_phase["sections"].append(
                    _build_preference_section(brands, brand_context, language),
                )

    # Packaging phase — bank scale questions (brand-agnostic) + target-brand heatmap section.
    packaging_phase = _compose_packaging_phase(
        pt_config,
        package_questions,
        language,
        brand_context,
    )
    if packaging_phase:
        phases.append(packaging_phase)

    from backend.trial_media_capture.snapshot import (
        append_trial_media_capture_to_phases,
        build_trial_media_capture_snapshot_meta,
    )

    phases = append_trial_media_capture_to_phases(phases, pt_config, language)

    meta = _compute_snapshot_meta(phases, len(brands), generated)

    hm_meta = None
    try:
        from backend.packaging_heatmap.snapshot import build_packaging_heatmap_snapshot_meta

        hm_meta = build_packaging_heatmap_snapshot_meta(pt_config)
    except Exception:
        hm_meta = None
    if hm_meta:
        meta["packaging_heatmap"] = hm_meta

    tm_meta = build_trial_media_capture_snapshot_meta(pt_config)
    if tm_meta:
        meta["trial_media_capture"] = tm_meta

    result: Dict[str, Any] = {
        "version": 1,
        "language": language,
        "phases": phases,
        "meta": meta,
    }
    if brand_context and brands:
        result["brand_context"] = brand_context

    from backend.trial_media_capture.snapshot import enrich_snapshot_with_trial_media_capture_meta

    return enrich_snapshot_with_trial_media_capture_meta(result, pt_config)


def migrate_legacy_l2_to_product_test_snapshot(
    l2_content: Optional[Dict[str, Any]],
    language: str = "en",
) -> Optional[Dict[str, Any]]:
    """
    Extract product_test_snapshot from legacy template_snapshot_l2 sections.
    Moves sections where module is product_test or package_test into timing phases.
    """
    sections = (l2_content or {}).get("sections") or []
    pt_sections = [
        s for s in sections
        if s.get("module") in ("product_test", "package_test", "packaging_heatmap", "trial_media_capture")
    ]
    if not pt_sections:
        return None

    phase_map: Dict[str, List[Dict[str, Any]]] = {}

    for raw_section in pt_sections:
        module = raw_section.get("module") or "product_test"
        questions = raw_section.get("questions") or []
        phase_buckets: Dict[str, List[Dict[str, Any]]] = {}

        for q in questions:
            phase = (
                "packaging"
                if module in ("package_test", "packaging_heatmap")
                else bank_timing_to_phase(q.get("timing"))
            )
            respondent_q = dict(q)
            respondent_q["timing"] = phase
            phase_buckets.setdefault(phase, []).append(respondent_q)

        for phase, qs in phase_buckets.items():
            section_id = (
                PACKAGING_SECTION_ID
                if module == "package_test"
                else (
                    f"packaging_heatmap_{_slugify(str(raw_section.get('brand') or 'target'))}"
                    if module == "packaging_heatmap"
                    else f"{phase}_{_slugify(str(raw_section.get('title') or 'section'))}"
                )
            )
            section = {
                "id": section_id,
                "title": raw_section.get("title") or "Section",
                "module": module,
                "timing": phase,
                "questions": sorted(qs, key=lambda x: _question_sort_key(x.get("id", "0"))),
            }
            phase_map.setdefault(phase, []).append(section)

    ordered = [p for p in PRODUCT_TEST_TIMING_PHASES if p in phase_map]
    if not ordered:
        return None

    phases = [
        {
            "timing": phase,
            "label": phase_label(phase, language),
            "sections": phase_map[phase],
        }
        for phase in ordered
    ]

    section_count = sum(len(p["sections"]) for p in phases)
    total_questions = sum(
        len(sec["questions"])
        for p in phases
        for sec in p["sections"]
    )

    return {
        "version": 1,
        "language": language,
        "phases": phases,
        "meta": {
            "totalQuestions": total_questions,
            "sectionCount": section_count,
            "phaseCount": len(phases),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }


def strip_product_test_from_l2(l2_content: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Remove product/package test sections from layer2 snapshot (taste-test only)."""
    sections = (l2_content or {}).get("sections") or []
    filtered = [
        s for s in sections
        if s.get("module") not in ("product_test", "package_test")
    ]
    return {"sections": filtered}
