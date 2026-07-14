"""
Canonical ID aliasing for DB-driven survey modules.

Bridges legacy aw_/pb_* response keys with pf_q* module IDs so analytics,
exports, and UI work across historical and new submissions.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

# Legacy → canonical purchase funnel IDs
LEGACY_PF_MAP: Dict[str, str] = {
    "aw_q1": "pf_q1",
    "aw_q2": "pf_q2",
    "aw_q3": "pf_q3",
    "pb_q1": "pf_q4",
    "pb_q2": "pf_q5",
    "pb_q3": "pf_q6",
    "pb_q4": "pf_q7",
}

PF_TO_LEGACY_MAP: Dict[str, str] = {v: k for k, v in LEGACY_PF_MAP.items()}

ALL_PF_KEYS: Set[str] = set(LEGACY_PF_MAP) | set(LEGACY_PF_MAP.values())

DEFAULT_AWARENESS_ROLES: Dict[str, str] = {
    "tom": "pf_q1",
    "other_unaided": "pf_q2",
    "aided": "pf_q3",
}

DEFAULT_STAGE_ROLES: Dict[str, str] = {
    "consideration": "pf_q4",
    "bought_12m": "pf_q5",
    "bought_3m": "pf_q6",
    "mou": "pf_q7",
}

# Legacy defaults used before pf_q migration (for backward-compatible fallbacks)
LEGACY_AWARENESS_DEFAULTS: Dict[str, str] = {
    "tom": "aw_q1",
    "other_unaided": "aw_q2",
    "aided": "aw_q3",
}

LEGACY_STAGE_DEFAULTS: Dict[str, str] = {
    "consideration": "pb_q1",
    "bought_12m": "pb_q2",
    "bought_3m": "pb_q3",
    "mou": "pb_q4",
}

CONFIGURABLE_MODULE_IDS: Tuple[str, ...] = (
    "purchase_funnel",
    "brand_usage",
    "brand_pricing_behavior",
    "brand_analyzer",
)


def _flatten_module_questions(snapshots: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for module_id in CONFIGURABLE_MODULE_IDS:
        mod = snapshots.get(module_id) or {}
        for section in mod.get("sections") or []:
            if not isinstance(section, dict):
                continue
            for q in section.get("questions") or []:
                if isinstance(q, dict) and q.get("question_id"):
                    out.append({**q, "_module_id": module_id})
    return out


def build_question_label_map(survey: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """question_id → display label from module snapshots."""
    survey = survey or {}
    labels: Dict[str, str] = {}
    for q in _flatten_module_questions(survey.get("module_snapshots") or {}):
        qid = str(q.get("question_id"))
        label = q.get("label") or q.get("en_text") or qid
        if isinstance(label, str) and label.strip():
            labels[qid] = label.strip()
        for legacy, canonical in LEGACY_PF_MAP.items():
            if canonical == qid and legacy not in labels:
                labels[legacy] = labels[qid]
    return labels


def build_analytical_context(survey: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Resolve awareness keys, stage roles, and legacy aliases for a survey.
    Precedence: analytical_mapping → module_snapshots → defaults.
    """
    survey = survey or {}
    mapping = survey.get("analytical_mapping") or {}
    snapshots = survey.get("module_snapshots") or {}

    awareness_keys: Dict[str, str] = dict(DEFAULT_AWARENESS_ROLES)
    stage_roles: Dict[str, str] = dict(DEFAULT_STAGE_ROLES)
    legacy_aliases: Dict[str, str] = dict(LEGACY_PF_MAP)

    # Snapshot-driven roles (pf_q* IDs)
    for q in _flatten_module_questions(snapshots):
        qid = str(q.get("question_id") or "")
        role = q.get("analytical_role")
        if not qid or not role:
            continue
        if role == "tom":
            awareness_keys["tom"] = qid
        elif role == "unaided":
            awareness_keys["other_unaided"] = qid
        elif role == "aided":
            awareness_keys["aided"] = qid
        elif role in stage_roles:
            stage_roles[role] = qid

    # Explicit analytical_mapping overrides
    if isinstance(mapping.get("awareness_keys"), dict):
        for role, qid in mapping["awareness_keys"].items():
            if isinstance(qid, str) and qid.strip():
                awareness_keys[str(role)] = qid.strip()

    for legacy_field, role in (
        ("tom", "tom"),
        ("unaided", "other_unaided"),
        ("aided", "aided"),
    ):
        val = mapping.get(legacy_field)
        if isinstance(val, str) and val.strip():
            awareness_keys[role] = val.strip()
        elif isinstance(val, list) and val and isinstance(val[0], str) and val[0].strip():
            awareness_keys[role] = val[0].strip()

    if isinstance(mapping.get("stage_roles"), dict):
        for role, qid in mapping["stage_roles"].items():
            if isinstance(qid, str) and qid.strip():
                stage_roles[str(role)] = qid.strip()

    if isinstance(mapping.get("legacy_id_aliases"), dict):
        for legacy, canonical in mapping["legacy_id_aliases"].items():
            if isinstance(legacy, str) and isinstance(canonical, str) and legacy.strip() and canonical.strip():
                legacy_aliases[legacy.strip()] = canonical.strip()

    # Include both pf and legacy question IDs in lookup sets for analytics
    awareness_question_ids = set(awareness_keys.values())
    for role, qid in list(awareness_keys.items()):
        if qid in PF_TO_LEGACY_MAP:
            awareness_question_ids.add(PF_TO_LEGACY_MAP[qid])

    stage_question_ids = set(stage_roles.values())
    for role, qid in list(stage_roles.items()):
        if qid in PF_TO_LEGACY_MAP:
            stage_question_ids.add(PF_TO_LEGACY_MAP[qid])

    return {
        "awareness_keys": awareness_keys,
        "stage_roles": stage_roles,
        "legacy_id_aliases": legacy_aliases,
        "question_labels": build_question_label_map(survey),
        "awareness_question_ids": sorted(awareness_question_ids),
        "stage_question_ids": sorted(stage_question_ids),
        "module_question_ids": {
            module_id: [
                str(q.get("question_id"))
                for q in _flatten_module_questions({module_id: snapshots.get(module_id) or {}})
                if q.get("question_id")
            ]
            for module_id in CONFIGURABLE_MODULE_IDS
            if snapshots.get(module_id)
        },
    }


def _mirror_pf_pair(store: Dict[str, Any], legacy: str, canonical: str) -> None:
    if canonical in store and legacy not in store:
        store[legacy] = store[canonical]
    if legacy in store and canonical not in store:
        store[canonical] = store[legacy]


def _merge_pf_dicts(*sources: Any) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    for src in sources:
        if isinstance(src, dict):
            merged.update(src)
    return merged


def collapse_pf_to_canonical(pf_answers: Dict[str, Any]) -> Dict[str, Any]:
    """Prefer pf_q* keys; fold legacy aw_/pb_* values in."""
    out: Dict[str, Any] = {}
    for key, val in pf_answers.items():
        if key in PF_TO_LEGACY_MAP:
            canonical = key
            out[canonical] = val
        elif key in LEGACY_PF_MAP:
            canonical = LEGACY_PF_MAP[key]
            if canonical not in out:
                out[canonical] = val
        else:
            out[key] = val
    return out


def expand_pf_with_legacy(pf_answers: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure both pf_q* and legacy keys exist when either is present."""
    out = dict(pf_answers)
    for legacy, canonical in LEGACY_PF_MAP.items():
        _mirror_pf_pair(out, legacy, canonical)
    return out


def normalize_module_answers(
    answers: Dict[str, Any],
    survey: Optional[Dict[str, Any]] = None,
    *,
    mode: str = "read",
) -> Dict[str, Any]:
    """
    Normalize module answer keys on read/write.

    mode:
      - read: fill pf_q* from legacy; mirror legacy from pf_q* for downstream consumers
      - write: mirror both directions (submit persistence)
      - both: same as write
    """
    if not isinstance(answers, dict):
        return answers

    result = copy.deepcopy(answers)
    structured = result.get("__structured")
    if not isinstance(structured, dict):
        structured = {}
        result["__structured"] = structured

    module_answers = structured.get("module_answers")
    if not isinstance(module_answers, dict):
        module_answers = {}
        structured["module_answers"] = module_answers

    pf_merged = _merge_pf_dicts(
        structured.get("purchase_funnel"),
        module_answers.get("purchase_funnel"),
        {k: v for k, v in result.items() if k in ALL_PF_KEYS},
    )

    if mode in ("read", "write", "both"):
        pf_merged = expand_pf_with_legacy(pf_merged)

    pf_canonical = collapse_pf_to_canonical(pf_merged)
    pf_legacy = expand_pf_with_legacy(pf_canonical)

    structured["purchase_funnel"] = pf_legacy
    module_answers["purchase_funnel"] = pf_canonical

    # Top-level PF keys for flat exports / legacy pipelines
    for key, val in pf_legacy.items():
        if key in ALL_PF_KEYS:
            result[key] = val

    # Pass through other module buckets unchanged
    for module_id in ("brand_usage", "brand_pricing_behavior", "brand_analyzer"):
        bucket = module_answers.get(module_id)
        if isinstance(bucket, dict):
            module_answers[module_id] = dict(bucket)
            ctx_ids = (build_analytical_context(survey).get("module_question_ids") or {}).get(module_id)
            if ctx_ids:
                for qid in ctx_ids:
                    if qid in bucket and qid not in result:
                        result[qid] = bucket[qid]

    return result


def extract_purchase_funnel_answers(
    answers: Dict[str, Any],
    survey: Optional[Dict[str, Any]] = None,
    *,
    canonical_only: bool = True,
) -> Dict[str, Any]:
    """Extract PF answers after normalization."""
    normalized = normalize_module_answers(answers, survey, mode="read")
    structured = normalized.get("__structured") or {}
    module_answers = structured.get("module_answers") or {}
    pf = module_answers.get("purchase_funnel") or structured.get("purchase_funnel") or {}
    if not isinstance(pf, dict):
        return {}
    return collapse_pf_to_canonical(pf) if canonical_only else expand_pf_with_legacy(pf)


def resolve_stage_question_id(
    stage_roles: Dict[str, str],
    role: str,
    *,
    include_legacy_fallback: bool = True,
) -> str:
    qid = stage_roles.get(role) or DEFAULT_STAGE_ROLES.get(role) or LEGACY_STAGE_DEFAULTS.get(role, "")
    if include_legacy_fallback and qid in PF_TO_LEGACY_MAP:
        return qid
    return qid


def resolve_awareness_question_id(
    awareness_keys: Dict[str, str],
    role: str,
) -> str:
    return (
        awareness_keys.get(role)
        or DEFAULT_AWARENESS_ROLES.get(role)
        or LEGACY_AWARENESS_DEFAULTS.get(role, "")
    )


def question_ids_for_role_lookup(ctx: Dict[str, Any], role: str, *, bucket: str = "stage") -> List[str]:
    """Return [canonical, legacy] IDs for a logical analytical role."""
    if bucket == "awareness":
        primary = resolve_awareness_question_id(ctx.get("awareness_keys") or {}, role)
    else:
        primary = resolve_stage_question_id(ctx.get("stage_roles") or {}, role)
    ids = [primary] if primary else []
    if primary in PF_TO_LEGACY_MAP:
        ids.append(PF_TO_LEGACY_MAP[primary])
    elif primary in LEGACY_PF_MAP:
        ids.append(LEGACY_PF_MAP[primary])
    return list(dict.fromkeys(ids))
