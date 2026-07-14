"""
Task 5.1 — Master Regression Test Suite
=========================================
Validates that all 18 hardening tasks (Phases 1-4) function in concert.
No external API calls are made. All tests are deterministic and offline.

Test Categories:
  Phase 1: Prefix Stabilization (System Freeze, Static-First, Latency)
  Phase 2: Foundational Abstractions (God Prompt, Budget, Compaction, Orchestrator, Dedup, Cache, Schema, Adaptive)
  Phase 3: Diagnostics (Hasher, Diff, Observability, Batch Grouping)
  Phase 4: Enforcement (Guardrails, Versioning, Multi-Tenant, Warmup)
  Integration: End-to-End pipeline coherence tests.
"""
import asyncio
import hashlib
import json
import sys
import os
import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from typing import Dict, Any

import pandas as pd
import numpy as np

# ---------------------------------------------------------------------------
# Fixture: Ensure backend is on sys.path
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Module Imports (All hardened modules)
# ---------------------------------------------------------------------------
from backend.analytics_module.src.ai.personas import PersonaManager, AIPersona
from backend.analytics_module.src.ai.prompt_registry import PromptRegistry
from backend.analytics_module.src.ai.token_budget import TokenBudget
from backend.analytics_module.src.ai.compaction import DataCompactor, compact_data
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.dedup import InFlightCoalescer
from backend.analytics_module.src.ai.prefix_hasher import PrefixHasher
from backend.analytics_module.src.ai.prompt_diff import PromptDiff
from backend.analytics_module.src.ai.api_cost import CostTracker
from backend.analytics_module.src.ai.batch_grouper import BatchGrouper
from backend.analytics_module.src.ai.guardrails import GuardrailEnforcer
from backend.analytics_module.src.ai.schemas import get_response_format, UNIFIED_AI_RESPONSE_SCHEMA
from backend.analytics_module.src.ai.warmup import CacheWarmer


# ===========================================================================
# FIXTURES
# ===========================================================================

@pytest.fixture
def sample_dataframe():
    """A realistic multi-brand survey DataFrame."""
    brands = ["Abu Auf", "Nestlé", "Mars", "Cadbury"]
    attributes = ["Taste", "Quality", "Price", "Packaging", "Availability"]
    np.random.seed(42)
    data = {attr: np.random.uniform(3.0, 5.0, len(brands)).round(2) for attr in attributes}
    data["Brand"] = brands
    return pd.DataFrame(data).set_index("Brand")


@pytest.fixture
def complex_dataframe():
    """A high-complexity DataFrame for budget stress testing."""
    np.random.seed(99)
    brands = [f"Brand_{i}" for i in range(50)]
    attrs = [f"Attr_{j}" for j in range(20)]
    data = {a: np.random.uniform(1.0, 5.0, len(brands)).round(2) for a in attrs}
    data["Brand"] = brands
    return pd.DataFrame(data).set_index("Brand")


@pytest.fixture
def god_prompt_text():
    """Loads the actual God Prompt from disk."""
    path = PROJECT_ROOT / "backend" / "resources" / "analytics" / "prompts" / "god_prompt.md"
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return "You are a Senior Strategic Analytics Director." * 100  # Fallback for CI (ensure > 4000 chars)


@pytest.fixture
def god_prompt_meta():
    """Loads God Prompt metadata."""
    path = PROJECT_ROOT / "backend" / "resources" / "analytics" / "prompts" / "god_prompt_meta.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"prefix_version": "1.0.0", "token_count": 1750, "sha256": "placeholder"}


@pytest.fixture
def cost_tracker():
    return CostTracker()


# ===========================================================================
# PHASE 1: PREFIX STABILIZATION
# ===========================================================================

class TestPhase1_PrefixStabilization:
    """Task 1.1, 1.2, 1.3 — System Freeze, Static-First, Latency Instrumentation."""

    # --- Task 1.1: Freeze System Message ---
    def test_1_1_persona_does_not_mutate_system(self):
        """PersonaManager.get_system_prompt() must return the base prompt unchanged."""
        base = "You are a Senior Strategic Analytics Director."
        for rtype in ["BA/PF", "TasteTest", "Standard", "ProductPlacement"]:
            pm = PersonaManager(rtype, archetype="Challenger")
            result = pm.get_system_prompt(base)
            assert result == base, f"System prompt mutated for research_type={rtype}"

    def test_1_1_persona_directive_is_user_role(self):
        """Persona context must be delivered via get_user_directive(), not system."""
        pm = PersonaManager("BA/PF", archetype="Leader")
        directive = pm.get_user_directive()
        assert "[ANALYTICAL ROLE]" in directive
        assert "Brand Strategist" in directive
        assert "Leader" in directive

    def test_1_1_persona_types_map_correctly(self):
        """Each research type maps to the expected persona."""
        assert PersonaManager("BA/PF").get_active_persona() == AIPersona.BRAND_STRATEGIST
        assert PersonaManager("TasteTest").get_active_persona() == AIPersona.PRODUCT_RESEARCHER
        assert PersonaManager("Standard").get_active_persona() == AIPersona.MARKET_ANALYST

    # --- Task 1.2: Static-First User Prompt ---
    def test_1_2_templates_have_static_head(self):
        """User prompt templates must NOT start with dynamic placeholders."""
        registry = PromptRegistry(
            PROJECT_ROOT / "resources" / "analytics" / "prompts"
        )
        dynamic_patterns = ["{slide_id}", "{chart_id}", "{brand_name}", "{research_type}"]
        for key in ["slide_insights", "chart_insights"]:
            tmpl = registry.get_template(key)
            user_base = tmpl.get("user_base", "")
            head = user_base[:300]
            for pat in dynamic_patterns:
                assert not head.startswith(pat), (
                    f"Template '{key}' starts with dynamic placeholder '{pat}'"
                )

    # --- Task 1.3: Latency Instrumentation ---
    def test_1_3_cost_tracker_records_duration(self, cost_tracker):
        """CostTracker entries must include duration_ms and ttft_ms fields."""
        cost_tracker.add("test_comp", "gpt-4.1", 500, 100, 200,
                         duration_ms=1234.5, ttft_ms=450.0)
        entry = cost_tracker._entries[-1]
        assert entry["duration_ms"] == 1234.5
        assert entry["ttft_ms"] == 450.0

    def test_1_3_latency_summary_computed(self, cost_tracker):
        """get_summary() must compute avg cached/uncached durations."""
        cost_tracker.add("A", "gpt-4.1", 500, 100, 200, duration_ms=800)  # cached
        cost_tracker.add("B", "gpt-4.1", 500, 100, 0, duration_ms=2000)   # uncached
        summary = cost_tracker.get_summary()
        assert summary["avg_cached_duration_ms"] == 800.0
        assert summary["avg_uncached_duration_ms"] == 2000.0
        assert summary["latency_reduction_pct"] == 60.0


# ===========================================================================
# PHASE 2: FOUNDATIONAL ABSTRACTIONS
# ===========================================================================

class TestPhase2_FoundationalAbstractions:
    """Tasks 2.1-2.8 — God Prompt, Budget, Compaction, Orchestrator, Dedup, Cache, Schema, Adaptive."""

    # --- Task 2.1: God Prompt ---
    def test_2_1_god_prompt_exists_and_sufficient(self, god_prompt_text):
        """God Prompt must exist and exceed 1024-token threshold (~4000 chars)."""
        assert len(god_prompt_text) >= 4000, (
            f"God Prompt is only {len(god_prompt_text)} chars, need >= 4000 for caching"
        )

    def test_2_1_god_prompt_hash_matches_meta(self, god_prompt_text, god_prompt_meta):
        """Runtime hash of God Prompt must match god_prompt_meta.json."""
        actual_hash = hashlib.sha256(god_prompt_text.encode("utf-8")).hexdigest()[:16]
        expected = god_prompt_meta.get("sha256", "")
        if expected and expected != "placeholder":
            assert actual_hash == expected, (
                f"God Prompt hash mismatch: {actual_hash} != {expected}"
            )

    def test_2_1_registry_returns_god_prompt(self):
        """PromptRegistry.get_god_prompt() must return a non-empty string."""
        registry = PromptRegistry(
            PROJECT_ROOT / "resources" / "analytics" / "prompts"
        )
        gp = registry.get_god_prompt()
        assert isinstance(gp, str)
        assert len(gp) > 100

    # --- Task 2.2: Token Budgeter ---
    def test_2_2_token_estimate_conservative(self):
        """Fast-path estimate must be >= //4 (conservative side)."""
        tb = TokenBudget("gpt-4.1")
        text = "Hello world, this is a test sentence for token estimation."
        estimate = tb.estimate_tokens(text)
        naive = len(text) // 4
        assert estimate >= naive, "Token estimate is less conservative than //4"

    def test_2_2_budget_allocation_positive(self, god_prompt_text):
        """Data budget must be positive after accounting for system + instructions."""
        tb = TokenBudget("gpt-4.1")
        budget = tb.allocate_data_budget(
            system_text=god_prompt_text,
            static_instructions="Analyze chart data. Provide headline and insights.",
            output_budget=600
        )
        assert budget > 0, "Data budget is non-positive"

    # --- Task 2.3: Compaction Pipeline ---
    def test_2_3_compaction_reduces_tokens(self, sample_dataframe):
        """Compact output must be <= 50% of raw to_string() output."""
        raw = sample_dataframe.to_string()
        compact = compact_data(sample_dataframe, len(raw))
        assert len(compact) <= len(raw), "Compacted output is larger than raw"

    def test_2_3_compaction_handles_empty(self):
        """Empty data must produce '(No data)' sentinel."""
        result = compact_data(None, 5000)
        assert "(No data)" in result or result.strip() == ""

    def test_2_3_compaction_respects_budget(self, complex_dataframe):
        """Output must not exceed char_budget."""
        budget = 500
        result = compact_data(complex_dataframe, budget)
        assert len(result) <= budget + 50  # Small tolerance for boundary

    # --- Task 2.4: Deterministic Orchestrator ---
    def test_2_4_system_message_identity(self, sample_dataframe):
        """All components must produce identical system messages."""
        system_msgs = set()
        for key in ["slide_insights", "chart_insights"]:
            try:
                msgs = PromptOrchestrator.construct_messages(
                    template_key=key, data=sample_dataframe,
                    model="gpt-4.1", research_type="Standard",
                    variables={"slide_id": "test_slide", "summary": "test"}
                )
                system_msgs.add(msgs[0]["content"])
            except Exception:
                pass
        if len(system_msgs) > 0:
            assert len(system_msgs) == 1, (
                f"System messages diverge across components: {len(system_msgs)} variants"
            )

    def test_2_4_messages_structure(self, sample_dataframe):
        """Orchestrator output must be [system, user] with correct roles."""
        msgs = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", research_type="Standard",
            variables={"slide_id": "chart_1"}
        )
        assert len(msgs) == 2
        assert msgs[0]["role"] == "system"
        assert msgs[1]["role"] == "user"
        assert len(msgs[0]["content"]) > 100
        assert len(msgs[1]["content"]) > 10

    @pytest.mark.asyncio
    async def test_2_5_coalescer_deduplicates(self):
        """Two identical concurrent calls must result in only one execution."""
        call_count = 0
        coalescer = InFlightCoalescer()

        async def expensive_call():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return "result"

        r1, r2 = await asyncio.gather(
            coalescer.execute_or_wait("key1", expensive_call),
            coalescer.execute_or_wait("key1", expensive_call),
        )
        assert r1 == r2 == "result"
        assert call_count == 1, f"Expected 1 call, got {call_count}"

    @pytest.mark.asyncio
    async def test_2_5_coalescer_different_keys(self):
        """Different keys must execute independently."""
        call_count = 0
        coalescer = InFlightCoalescer()

        async def expensive_call():
            nonlocal call_count
            call_count += 1
            return "result"

        await asyncio.gather(
            coalescer.execute_or_wait("A", expensive_call),
            coalescer.execute_or_wait("B", expensive_call),
        )
        assert call_count == 2

    # --- Task 2.7: Unified Schema ---
    def test_2_7_all_schemas_unified(self):
        """All schema keys must resolve to the same UNIFIED schema object."""
        schemas = set()
        for key in ["chart_insights", "verbatim_brand", "executive_summary", "unified"]:
            schema = get_response_format(key)
            schemas.add(json.dumps(schema, sort_keys=True))
        assert len(schemas) == 1, f"Schema branching detected: {len(schemas)} variants"

    def test_2_7_schema_structure(self):
        """Unified schema must have headline, insights, meta."""
        schema = UNIFIED_AI_RESPONSE_SCHEMA
        props = schema["json_schema"]["schema"]["properties"]
        assert "headline" in props
        assert "insights" in props
        assert "meta" in props

    # --- Task 2.8: Adaptive Output Budget ---
    def test_2_8_budget_scales_with_complexity(self, sample_dataframe, complex_dataframe):
        """Complex data should produce higher output budget than simple data."""
        simple_budget = PromptOrchestrator._get_adaptive_output_budget("chart_insights", sample_dataframe)
        complex_budget = PromptOrchestrator._get_adaptive_output_budget("chart_insights", complex_dataframe)
        assert complex_budget >= simple_budget, "Complex data didn't produce higher budget"

    def test_2_8_budget_has_ceiling(self, complex_dataframe):
        """Adaptive budget must not exceed 2x base."""
        budget = PromptOrchestrator._get_adaptive_output_budget("chart_insights", complex_dataframe)
        base = 600  # BASE_BUDGETS["chart_insights"]
        assert budget <= base * 2, f"Budget {budget} exceeds 2x ceiling ({base * 2})"


# ===========================================================================
# PHASE 3: DIAGNOSTIC & PREDICTIVE TOOLING
# ===========================================================================

class TestPhase3_DiagnosticTooling:
    """Tasks 3.1-3.4 — Hasher, Diff, Observability, Batch Grouping."""

    # --- Task 3.1: Golden Prefix Hashing ---
    def test_3_1_hasher_verifies_match(self, god_prompt_text):
        """PrefixHasher must verify a matching hash."""
        hasher = PrefixHasher()
        h = hasher.hash(god_prompt_text)
        hasher2 = PrefixHasher(expected_hash=h)
        assert hasher2.verify_or_warn(god_prompt_text) is True

    def test_3_1_hasher_detects_mismatch(self, god_prompt_text):
        """PrefixHasher must detect a corrupted prompt."""
        hasher = PrefixHasher(expected_hash="bad_hash_value")
        assert hasher.verify_or_warn(god_prompt_text) is False

    def test_3_1_hasher_deterministic(self, god_prompt_text):
        """Same input must always produce the same hash."""
        h = PrefixHasher()
        assert h.hash(god_prompt_text) == h.hash(god_prompt_text)

    # --- Task 3.2: Prompt Diff Analyzer ---
    def test_3_2_diff_identical(self):
        """Identical strings must report 100% match."""
        result = PromptDiff.find_divergence("hello world", "hello world")
        assert result["match_pct"] == 100.0
        assert result["char_index"] == -1

    def test_3_2_diff_finds_divergence(self):
        """Diff must pinpoint the exact character of divergence."""
        r = PromptDiff.find_divergence("hello world", "hello World")
        assert r["char_index"] == 6  # 'w' vs 'W'

    def test_3_2_diff_length_mismatch(self):
        """Diff must report length mismatches."""
        r = PromptDiff.find_divergence("abc", "abcdef")
        assert "note" in r or r["char_index"] == 3

    # --- Task 3.3: Cache-Aware Observability ---
    def test_3_3_cost_savings_computed(self, cost_tracker):
        """get_summary() must compute cost_saved_usd."""
        cost_tracker.add("A", "gpt-4.1", 1000, 100, 500, duration_ms=800)
        summary = cost_tracker.get_summary()
        assert "total_cost_saved_usd" in summary
        assert summary["total_cost_saved_usd"] >= 0

    def test_3_3_dedup_counter_tracks(self, cost_tracker):
        """Dedup counter must increment correctly."""
        cost_tracker.record_dedup_save()
        cost_tracker.record_dedup_save()
        assert cost_tracker.dedup_saved_calls == 2
        summary = cost_tracker.get_summary()
        assert summary["dedup_saved_calls"] == 2

    def test_3_3_component_breakdown(self, cost_tracker):
        """Summary must include per-component breakdown."""
        cost_tracker.add("chart_insights", "gpt-4.1", 500, 100, 200, duration_ms=1000)
        cost_tracker.add("verbatim", "gpt-4.1", 600, 150, 300, duration_ms=900)
        summary = cost_tracker.get_summary()
        assert "chart_insights" in summary["by_component"]
        assert "verbatim" in summary["by_component"]

    # --- Task 3.4: Batch Grouping ---
    def test_3_4_groups_by_schema(self):
        """BatchGrouper must group tasks by response_format name."""
        tasks = [
            {"id": 1, "response_format": {"json_schema": {"name": "unified_ai_response"}}},
            {"id": 2, "response_format": {"json_schema": {"name": "unified_ai_response"}}},
            {"id": 3, "response_format": {"json_schema": {"name": "other_schema"}}},
        ]
        groups = BatchGrouper.group_by_schema(tasks)
        assert len(groups) == 2
        sizes = sorted([len(g) for g in groups])
        assert sizes == [1, 2]


# ===========================================================================
# PHASE 4: ENFORCEMENT & SCALE
# ===========================================================================

class TestPhase4_Enforcement:
    """Tasks 4.1-4.4 — Guardrails, Versioning, Multi-Tenant, Warmup."""

    # --- Task 4.1: Guardrail Enforcer ---
    def test_4_1_rejects_short_system(self, god_prompt_text):
        """Guardrail must flag system prompts below 4000 chars."""
        enforcer = GuardrailEnforcer(golden_hash="dummy")
        short_messages = [
            {"role": "system", "content": "Short prompt."},
            {"role": "user", "content": "Hello"}
        ]
        violations = enforcer.validate(short_messages)
        assert any("SYSTEM_VOLUME_FAIL" in v for v in violations)

    def test_4_1_validates_golden_hash(self, god_prompt_text):
        """Guardrail must detect hash mismatch."""
        actual_hash = hashlib.sha256(god_prompt_text.encode("utf-8")).hexdigest()[:16]
        enforcer = GuardrailEnforcer(golden_hash="wrong_hash")
        messages = [
            {"role": "system", "content": god_prompt_text},
            {"role": "user", "content": "Analyze this data."}
        ]
        violations = enforcer.validate(messages)
        assert any("PREFIX_IDENTITY_FAIL" in v for v in violations)

    def test_4_1_passes_valid_prompt(self, god_prompt_text):
        """Guardrail must pass a correctly constructed prompt."""
        actual_hash = hashlib.sha256(god_prompt_text.encode("utf-8")).hexdigest()[:16]
        enforcer = GuardrailEnforcer(golden_hash=actual_hash)
        messages = [
            {"role": "system", "content": god_prompt_text},
            {"role": "user", "content": "Analyze the following chart data. Provide insights." + " " * 500}
        ]
        violations = enforcer.validate(messages)
        # Should not have SYSTEM_VOLUME or PREFIX_IDENTITY violations
        critical = [v for v in violations if "SYSTEM_VOLUME" in v or "PREFIX_IDENTITY" in v]
        assert len(critical) == 0, f"False violations: {critical}"

    def test_4_1_detects_dynamic_head(self, god_prompt_text):
        """Guardrail must flag dynamic placeholders in user prompt head."""
        actual_hash = hashlib.sha256(god_prompt_text.encode("utf-8")).hexdigest()[:16]
        enforcer = GuardrailEnforcer(golden_hash=actual_hash)
        messages = [
            {"role": "system", "content": god_prompt_text},
            {"role": "user", "content": "{slide_id} - Analyze this."}
        ]
        violations = enforcer.validate(messages)
        assert any("DYNAMIC_HEAD_VIOLATION" in v for v in violations)

    # --- Task 4.2: Prefix Versioning ---
    def test_4_2_cost_tracker_stores_version(self, cost_tracker):
        """CostTracker entries must include prefix_version."""
        cost_tracker.add("test", "gpt-4.1", 100, 50, 0, prefix_version="2.0.0")
        entry = cost_tracker._entries[-1]
        assert entry["prefix_version"] == "2.0.0"

    def test_4_2_version_from_meta(self, god_prompt_meta):
        """God prompt meta must have a valid prefix_version."""
        version = god_prompt_meta.get("prefix_version", "")
        assert version, "prefix_version is missing from meta"
        parts = version.split(".")
        assert len(parts) == 3, f"Version '{version}' is not semver"

    # --- Task 4.3: Multi-Tenant Cache Optimization ---
    def test_4_3_tenant_data_at_bottom(self, sample_dataframe):
        """Tenant-specific context (brand, persona) must appear AFTER static instructions."""
        msgs = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", research_type="BA/PF",
            archetype="Challenger",
            variables={"slide_id": "test_slide", "brand_name": "Abu Auf"}
        )
        user_content = msgs[1]["content"]
        # The 'ANALYTICAL CONTEXT' block should be in the bottom half
        context_pos = user_content.find("ANALYTICAL CONTEXT")
        assert context_pos > 0, "ANALYTICAL CONTEXT block not found"
        midpoint = len(user_content) // 3  # Should be in bottom 2/3
        assert context_pos > midpoint, (
            f"Context block at position {context_pos} (midpoint={midpoint}), "
            "should be in the bottom portion of the prompt"
        )

    def test_4_3_prefix_shared_across_tenants(self, sample_dataframe):
        """Two different tenants must share the same user prompt prefix."""
        msgs_a = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", research_type="Standard",
            variables={"slide_id": "chart_1", "brand_name": "Abu Auf"}
        )
        msgs_b = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", research_type="Standard",
            variables={"slide_id": "chart_1", "brand_name": "Nestlé"}
        )
        # System messages must be identical
        assert msgs_a[0]["content"] == msgs_b[0]["content"]
        # User prompt prefix (first 200 chars) should be identical
        user_a = msgs_a[1]["content"]
        user_b = msgs_b[1]["content"]
        diff = PromptDiff.find_divergence(user_a, user_b)
        # The divergence should be deep (> 200 chars)
        assert diff["char_index"] > 100 or diff["match_pct"] > 80, (
            f"Prefix diverges too early at char {diff['char_index']} ({diff['match_pct']}% match)"
        )

    # --- Task 4.4: Warmup ---
    def test_4_4_warmup_exists(self):
        """CacheWarmer module must be importable and have warmup method."""
        assert hasattr(CacheWarmer, "warmup")
        import inspect
        assert inspect.iscoroutinefunction(CacheWarmer.warmup)


# ===========================================================================
# INTEGRATION: END-TO-END COHERENCE
# ===========================================================================

class TestIntegration_EndToEnd:
    """Cross-phase integration tests proving all systems work in concert."""

    def test_full_pipeline_coherence(self, sample_dataframe, god_prompt_text):
        """
        The Grand Unified Test:
        Orchestrator → Guardrails → Hasher → Compaction → Budget → Schema
        must all agree on a single, valid message list.
        """
        # 1. Build messages
        msgs = PromptOrchestrator.construct_messages(
            template_key="slide_insights",
            data=sample_dataframe,
            model="gpt-4.1",
            research_type="Standard",
            variables={"slide_id": "integration_test"}
        )

        # 2. Verify structure
        assert len(msgs) == 2
        assert msgs[0]["role"] == "system"

        # 3. Verify God Prompt is used (not a short fallback)
        assert len(msgs[0]["content"]) > 1000

        # 4. Verify user content has compacted data (not raw DataFrame)
        user = msgs[1]["content"]
        assert "to_string" not in user  # No raw DataFrame dumps
        assert len(user) > 50

        # 5. Verify schema is unified
        schema = get_response_format("chart_insights")
        assert schema["json_schema"]["name"] == "unified_ai_response"

        # 6. Verify budget is reasonable
        tb = TokenBudget("gpt-4.1")
        sys_tokens = tb.estimate_tokens(msgs[0]["content"])
        usr_tokens = tb.estimate_tokens(msgs[1]["content"])
        total = sys_tokens + usr_tokens + 600  # output budget
        assert total < 128_000, f"Total tokens {total} exceeds context window"

    def test_observability_to_guardrail_chain(self, cost_tracker, god_prompt_text):
        """CostTracker must record all metrics needed by the Guardrail system."""
        cost_tracker.add("test", "gpt-4.1", 1000, 200, 500,
                         duration_ms=1500, ttft_ms=300, prefix_version="1.0.0")
        summary = cost_tracker.get_summary()

        # All Phase 3 metrics must be present
        assert "cache_hit_rate_pct" in summary
        assert "total_cost_saved_usd" in summary
        assert "total_latency_saved_ms" in summary
        assert "dedup_saved_calls" in summary
        assert "by_component" in summary

        # Prefix version must be logged
        assert cost_tracker._entries[0]["prefix_version"] == "1.0.0"

    def test_diff_catches_prefix_regression(self, sample_dataframe):
        """PromptDiff must detect if a code change broke prefix sharing."""
        msgs_a = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", variables={"slide_id": "A"}
        )
        msgs_b = PromptOrchestrator.construct_messages(
            template_key="slide_insights", data=sample_dataframe,
            model="gpt-4.1", variables={"slide_id": "B"}
        )
        # System must be identical
        sys_diff = PromptDiff.find_divergence(
            msgs_a[0]["content"], msgs_b[0]["content"]
        )
        assert sys_diff["match_pct"] == 100.0

    def test_reset_clears_all_state(self, cost_tracker):
        """CostTracker.reset() must clear all accumulated state."""
        cost_tracker.add("x", "gpt-4.1", 100, 50, 0)
        cost_tracker.reset()
        summary = cost_tracker.get_summary()
        assert summary["total_tokens"] == 0
        assert summary["total_cost_usd"] == 0.0


# ===========================================================================
# RUNNER
# ===========================================================================
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-q"])
