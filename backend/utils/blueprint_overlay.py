"""Merge analyst blueprint copy edits onto orchestrated survey snapshots."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

QUESTION_CONTENT_KEYS = (
    "label",
    "text",
    "en_text",
    "ar_text",
    "options",
    "questionMeta",
    "minLabel",
    "maxLabel",
    "required",
    "type",
    "value",
    "placeholder",
)


def _question_key(question: Dict[str, Any]) -> Optional[str]:
    key = question.get("id") or question.get("question_id")
    if key is None:
        return None
    return str(key)


def _apply_question_overlay(base: Dict[str, Any], edited: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key in QUESTION_CONTENT_KEYS:
        if key in edited and edited[key] is not None:
            merged[key] = edited[key]
    return merged


def _index_layer_questions(schema: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    if not schema:
        return {}

    indexed: Dict[str, Dict[str, Any]] = {}
    for layer_key, layer in schema.items():
        if not str(layer_key).endswith("_structure"):
            continue
        if not isinstance(layer, dict):
            continue
        for section in layer.get("sections") or []:
            if not isinstance(section, dict) or section.get("isInstruction"):
                continue
            for question in section.get("questions") or []:
                if not isinstance(question, dict):
                    continue
                key = _question_key(question)
                if key:
                    indexed[key] = question
    return indexed


def _index_product_test_snapshot(snapshot: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    if not snapshot or not isinstance(snapshot, dict):
        return {}

    indexed: Dict[str, Dict[str, Any]] = {}
    for phase in snapshot.get("phases") or []:
        if not isinstance(phase, dict):
            continue
        for section in phase.get("sections") or []:
            if not isinstance(section, dict):
                continue
            for question in section.get("questions") or []:
                if not isinstance(question, dict):
                    continue
                key = _question_key(question)
                if key:
                    indexed[key] = question
    return indexed


def collect_blueprint_question_edits(
    edited_schema: Optional[Dict[str, Any]],
    edited_product_test_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Flatten edited architect schema into question-id → question payload."""
    edits: Dict[str, Dict[str, Any]] = {}
    edits.update(_index_layer_questions(edited_schema))
    edits.update(_index_product_test_snapshot(edited_product_test_snapshot))
    if edited_schema and isinstance(edited_schema.get("product_test_snapshot"), dict):
        edits.update(_index_product_test_snapshot(edited_schema["product_test_snapshot"]))
    return edits


def _patch_section_questions(
    sections: Iterable[Dict[str, Any]],
    edits: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    patched_sections: List[Dict[str, Any]] = []
    for section in sections:
        section_copy = deepcopy(section)
        if section_copy.get("isInstruction"):
            patched_sections.append(section_copy)
            continue
        questions = []
        for question in section_copy.get("questions") or []:
            if not isinstance(question, dict):
                questions.append(question)
                continue
            key = _question_key(question)
            if key and key in edits:
                questions.append(_apply_question_overlay(question, edits[key]))
            else:
                questions.append(question)
        section_copy["questions"] = questions
        patched_sections.append(section_copy)
    return patched_sections


def _patch_layer_structures(schema: Dict[str, Any], edits: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    patched = deepcopy(schema)
    for layer_key, layer in list(patched.items()):
        if not str(layer_key).endswith("_structure"):
            continue
        if not isinstance(layer, dict):
            continue
        layer["sections"] = _patch_section_questions(layer.get("sections") or [], edits)
    return patched


def _patch_product_test_snapshot(
    snapshot: Optional[Dict[str, Any]],
    edits: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not snapshot or not isinstance(snapshot, dict):
        return snapshot

    patched = deepcopy(snapshot)
    for phase in patched.get("phases") or []:
        if not isinstance(phase, dict):
            continue
        for section in phase.get("sections") or []:
            if not isinstance(section, dict):
                continue
            questions = []
            for question in section.get("questions") or []:
                if not isinstance(question, dict):
                    questions.append(question)
                    continue
                key = _question_key(question)
                if key and key in edits:
                    questions.append(_apply_question_overlay(question, edits[key]))
                else:
                    questions.append(question)
            section["questions"] = questions
    return patched


def overlay_blueprint_edits(
    target: Dict[str, Any],
    edited_schema: Optional[Dict[str, Any]],
    edited_product_test_snapshot: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Apply analyst blueprint text/option edits onto orchestrated survey snapshots.
    Mutates ``target`` in place.
    """
    edits = collect_blueprint_question_edits(edited_schema, edited_product_test_snapshot)
    if not edits:
        return

    orchestrated_schema = target.get("template_snapshot_schema")
    if isinstance(orchestrated_schema, dict):
        patched_schema = _patch_layer_structures(orchestrated_schema, edits)
        target["template_snapshot_schema"] = patched_schema
        l1_sections = (
            patched_schema.get("layer1_structure", {}).get("sections") or []
        )
        if l1_sections:
            target["template_snapshot_questions"] = deepcopy(
                l1_sections[0].get("questions") or []
            )

        l2 = patched_schema.get("layer2_structure")
        if isinstance(l2, dict):
            from backend.services.product_test_orchestration import strip_product_test_from_l2

            target["template_snapshot_l2"] = strip_product_test_from_l2(l2)

    if target.get("product_test_snapshot") is not None or edited_product_test_snapshot:
        target["product_test_snapshot"] = _patch_product_test_snapshot(
            target.get("product_test_snapshot") or edited_product_test_snapshot,
            edits,
        )
