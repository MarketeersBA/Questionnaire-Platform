"""
Canonical ID convention for taste_test_questions collection.

New questions use tt_q1..tt_qN IDs. Legacy UUID (or other) IDs are preserved
in legacy_id for backward-compatible analytics and response keys.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

TASTE_TEST_MODULE_ID = "taste_test"
TASTE_TEST_QUESTION_ID_PREFIX = "tt"
_TT_CANONICAL_RE = re.compile(r"^tt_q\d+$", re.IGNORECASE)


def is_tt_canonical(question_id: str) -> bool:
    return bool(question_id) and bool(_TT_CANONICAL_RE.match(str(question_id).strip()))


def build_tt_question_id(sequence_index: int) -> str:
    return f"{TASTE_TEST_QUESTION_ID_PREFIX}_q{sequence_index}"


def sort_questions_for_assignment(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deterministic ordering so tt_q* assignment is stable across environments."""
    timing_order = {"Layer 1": 0, "Before Taste": 1, "After Taste": 2}

    def _key(doc: Dict[str, Any]) -> Tuple[Any, ...]:
        return (
            timing_order.get(str(doc.get("timing") or ""), 99),
            str(doc.get("question_status") or ""),
            str(doc.get("main_att") or ""),
            str(doc.get("supp_att") or ""),
            str(doc.get("en_text") or ""),
            str(doc.get("question_id") or ""),
        )

    return sorted(docs, key=_key)


def _next_tt_index(used: set) -> int:
    index = 1
    while index in used:
        index += 1
    used.add(index)
    return index


def plan_tt_id_assignments(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Return per-document update payloads with canonical question_id, legacy_id,
    and question_id_prefix. Idempotent for docs that already use tt_q*.
    """
    sorted_docs = sort_questions_for_assignment(docs)
    updates: List[Dict[str, Any]] = []
    used_indices: set = set()

    for doc in sorted_docs:
        current_id = str(doc.get("question_id") or "")
        if is_tt_canonical(current_id):
            num_match = re.search(r"q(\d+)$", current_id, re.IGNORECASE)
            if num_match:
                used_indices.add(int(num_match.group(1)))

    for doc in sorted_docs:
        current_id = str(doc.get("question_id") or "")
        if is_tt_canonical(current_id):
            canonical = current_id
        else:
            canonical = build_tt_question_id(_next_tt_index(used_indices))

        legacy = doc.get("legacy_id")
        if not legacy and current_id and current_id != canonical:
            legacy = current_id

        updates.append(
            {
                "_id": doc["_id"],
                "question_id": canonical,
                "legacy_id": legacy,
                "question_id_prefix": doc.get("question_id_prefix") or TASTE_TEST_QUESTION_ID_PREFIX,
            }
        )

    return updates


def build_alias_map_from_docs(docs: Iterable[Dict[str, Any]]) -> Dict[str, str]:
    """Map any known ID (legacy or pre-migration question_id) → canonical tt_q*."""
    aliases: Dict[str, str] = {}
    for doc in docs:
        canonical = str(doc.get("question_id") or "")
        if not canonical:
            continue
        aliases[canonical] = canonical

        legacy = doc.get("legacy_id")
        if legacy:
            aliases[str(legacy)] = canonical

        # Pre-migration docs may still store legacy value in question_id
        stored = doc.get("question_id")
        if stored and str(stored) != canonical:
            aliases[str(stored)] = canonical

    return aliases


def build_module_metadata(docs: Optional[Iterable[Dict[str, Any]]] = None) -> Dict[str, Any]:
    alias_map = build_alias_map_from_docs(docs or [])
    return {
        "module_id": TASTE_TEST_MODULE_ID,
        "question_id_prefix": TASTE_TEST_QUESTION_ID_PREFIX,
        "legacy_id_aliases": alias_map,
    }


def resolve_taste_test_context(survey_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Resolve taste-test ID prefix and alias map from survey metadata.

    Precedence:
      taste_test_config.module_metadata → taste_test_config.question_id_prefix
      analytical_mapping.taste_test → defaults
    """
    prefix = TASTE_TEST_QUESTION_ID_PREFIX
    alias_map: Dict[str, str] = {}

    if not isinstance(survey_meta, dict):
        return {"prefix": prefix, "alias_map": alias_map, "module_metadata": build_module_metadata()}

    ttc = survey_meta.get("taste_test_config") or {}
    module_meta = ttc.get("module_metadata") or {}
    analytical = survey_meta.get("analytical_mapping") or {}

    if isinstance(module_meta, dict):
        prefix = str(module_meta.get("question_id_prefix") or ttc.get("question_id_prefix") or prefix)
        raw_aliases = module_meta.get("legacy_id_aliases")
        if isinstance(raw_aliases, dict):
            alias_map = {str(k): str(v) for k, v in raw_aliases.items()}

    if not alias_map:
        tt_analytical = analytical.get("taste_test") or {}
        raw_aliases = tt_analytical.get("legacy_id_aliases")
        if isinstance(raw_aliases, dict):
            alias_map = {str(k): str(v) for k, v in raw_aliases.items()}

    if not prefix or prefix == TASTE_TEST_QUESTION_ID_PREFIX:
        prefix = str(ttc.get("question_id_prefix") or TASTE_TEST_QUESTION_ID_PREFIX)

    return {
        "prefix": prefix,
        "alias_map": alias_map,
        "module_metadata": {
            "module_id": TASTE_TEST_MODULE_ID,
            "question_id_prefix": prefix,
            "legacy_id_aliases": alias_map,
        },
    }


def normalize_taste_test_question_id(
    question_id: str,
    alias_map: Optional[Dict[str, str]] = None,
) -> str:
    """Resolve a flat_evaluations question_id to canonical tt_q* when possible."""
    if not question_id:
        return question_id
    qid = str(question_id).strip()
    if is_tt_canonical(qid):
        return qid
    if alias_map and qid in alias_map:
        return alias_map[qid]
    return qid


def resolve_taste_test_question_id(q: Dict[str, Any], meta: Dict[str, Any]) -> str:
    """Resolve a question document and its metadata map to a canonical ID."""
    current_id = str(q.get("question_id") or "")
    alias_map = (meta or {}).get("legacy_id_aliases") or {}
    return normalize_taste_test_question_id(current_id, alias_map)


def map_question_for_api(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Map a taste_test_questions document to API shape with canonical IDs."""
    question_id = str(doc.get("question_id") or "")
    legacy_id = doc.get("legacy_id")
    if not legacy_id and question_id and not is_tt_canonical(question_id):
        legacy_id = question_id

    canonical_id = question_id if is_tt_canonical(question_id) else question_id

    return {
        "question_id": canonical_id,
        "legacy_id": legacy_id,
        "question_id_prefix": doc.get("question_id_prefix") or TASTE_TEST_QUESTION_ID_PREFIX,
        "en_text": doc.get("en_text"),
        "ar_text": doc.get("ar_text"),
        "en_options": doc.get("en_options"),
        "ar_options": doc.get("ar_options"),
        "question_type": doc.get("question_type"),
        "timing": doc.get("timing"),
        "question_status": doc.get("question_status"),
        "main_att": doc.get("main_att"),
        "supp_att": doc.get("supp_att"),
        "label": doc.get("supp_att"),
        "ar_min_label": doc.get("ar_min_label"),
        "ar_max_label": doc.get("ar_max_label"),
        "en_min_label": doc.get("en_min_label"),
        "en_max_label": doc.get("en_max_label"),
    }


async def load_taste_test_alias_map(db: Any) -> Dict[str, str]:
    """Load legacy → canonical map from taste_test_questions collection."""
    col = db.get_collection("taste_test_questions")
    docs = await col.find({}, {"question_id": 1, "legacy_id": 1, "question_id_prefix": 1}).to_list(
        length=5000
    )
    return build_alias_map_from_docs(docs)
