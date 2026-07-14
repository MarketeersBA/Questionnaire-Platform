"""Phase 5 — God Prompt v2.0 intelligence protocol sections."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from backend.analytics_module.src.ai.prefix_hasher import PrefixHasher
from backend.analytics_module.src.ai.prompt_registry import registry

_PROMPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "analytics"
    / "prompts"
    / "god_prompt.md"
)
_META_PATH = _PROMPT_PATH.parent / "god_prompt_meta.json"


class TestPhase5GodPromptV2:
    def test_meta_version_and_hash(self):
        meta = json.loads(_META_PATH.read_text(encoding="utf-8"))
        text = _PROMPT_PATH.read_text(encoding="utf-8").strip()

        assert meta["version"] == "2.0.0"
        assert meta["prefix_version"] == "2.0.0"
        assert meta["last_validated"] == "2026-07-06"
        assert "Survey Intelligence Protocol" in meta["impact"]

        actual = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        assert meta["sha256"] == actual
        assert PrefixHasher(expected_hash=meta["sha256"]).verify_or_warn(text) is True

    def test_new_sections_present_after_terminology_dictionary(self):
        text = _PROMPT_PATH.read_text(encoding="utf-8")
        term_idx = text.index("## TERMINOLOGY DICTIONARY")
        survey_idx = text.index("## SURVEY INTELLIGENCE PROTOCOL")
        category_idx = text.index("## CATEGORY INTELLIGENCE LAYER")
        objective_idx = text.index("## OBJECTIVE ALIGNMENT RULE")
        rubric_idx = text.index("## OUTPUT QUALITY RUBRIC")

        assert term_idx < survey_idx < category_idx < objective_idx < rubric_idx

    def test_survey_intelligence_protocol_content(self):
        text = _PROMPT_PATH.read_text(encoding="utf-8")
        section = text.split("## SURVEY INTELLIGENCE PROTOCOL")[1].split("## CATEGORY")[0]
        assert "BLIND" in section
        assert "BRANDED" in section
        assert "MONADIC" in section
        assert "PAIRED COMPARISON" in section
        assert "brand equity" in section.lower()

    def test_category_intelligence_layer_content(self):
        text = _PROMPT_PATH.read_text(encoding="utf-8")
        section = text.split("## CATEGORY INTELLIGENCE LAYER")[1].split("## OBJECTIVE")[0]
        assert "FMCG / F&B" in section
        assert "Personal Care" in section
        assert "Beverages" in section
        assert "Category Unspecified" in section

    def test_objective_alignment_rule_content(self):
        text = _PROMPT_PATH.read_text(encoding="utf-8")
        section = text.split("## OBJECTIVE ALIGNMENT RULE")[1].split("## OUTPUT")[0]
        assert "Survey Objective" in section
        assert "Purchase Intent" in section
        assert "Awareness" in section
        assert "attribute acceptance" in section.lower()

    def test_existing_sections_preserved(self):
        text = _PROMPT_PATH.read_text(encoding="utf-8")
        for heading in (
            "## ROLE DEFINITION",
            "## CORE ANALYTICAL PRINCIPLES",
            "## TERMINOLOGY DICTIONARY",
            "## OUTPUT QUALITY RUBRIC",
            "## ANTI-HALLUCINATION RULES",
            "## FEW-SHOT EXAMPLES",
        ):
            assert heading in text

    def test_registry_loads_v2_prefix(self):
        assert registry.get_prefix_version() == "2.0.0"
        assert len(registry.get_god_prompt()) >= 4000
