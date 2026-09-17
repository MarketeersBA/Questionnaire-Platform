"""Phase 7 — Prompt suite versioning and automatic AI cache invalidation."""

from __future__ import annotations

import pytest

from backend.analytics_module.src.ai.insight_cache import InsightCacheManager
from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.prompt_registry import (
    ANALYTICS_PROMPT_SUITE_VERSION,
    CACHE_VERSIONED_PROMPT_KEYS,
    DEFAULT_PREFIX_VERSION,
    registry,
)
from backend.models import AIInsightCacheEntry


class TestPhase7CacheInvalidation:
    def test_suite_version_constant(self):
        assert ANALYTICS_PROMPT_SUITE_VERSION == "2.0.0"
        assert DEFAULT_PREFIX_VERSION == "2.0.0"

    def test_every_cache_versioned_prompt_declares_a_usable_version(self):
        """
        Each prompt must carry a version the cache key can be built from.

        This used to assert the literal "2.0.0" for every prompt, which made
        it fail the moment any prompt was legitimately revised — the version
        bump is exactly how stale cached insights get invalidated, so pinning
        it turned a correct change into a red test.

        What actually matters is the invariant: a version exists, it parses as
        semver, and it has not regressed below the 2.x baseline that the cache
        entry defaults assume.
        """
        for key in sorted(CACHE_VERSIONED_PROMPT_KEYS):
            version = registry.get_template_version(key)
            assert version, f"Prompt '{key}' has no version; its cache key cannot be built"

            parts = version.split(".")
            assert len(parts) == 3 and all(p.isdigit() for p in parts), (
                f"Prompt '{key}' version {version!r} is not semver"
            )
            assert int(parts[0]) >= 2, (
                f"Prompt '{key}' is at {version}, below the 2.x cache baseline"
            )

    def test_ai_insight_cache_entry_defaults(self):
        entry = AIInsightCacheEntry(
            survey_id="survey-1",
            component_type="chart_insight",
            component_key="chart_1",
        )
        assert entry.prompt_version == "2.0.0"
        assert entry.prefix_version == "2.0.0"

    def test_cache_lookup_query_excludes_legacy_versions(self):
        """Legacy cached rows (v1.x) must not match v2 lookup keys."""
        legacy_query = {
            "survey_id": "abc",
            "component_type": "chart_insight",
            "component_key": "brand_comparison",
            "prompt_version": "1.1.0",
            "prefix_version": "1.0.0",
        }
        current_query = {
            "survey_id": "abc",
            "component_type": "chart_insight",
            "component_key": "brand_comparison",
            "prompt_version": registry.get_template_version("chart_insights"),
            "prefix_version": PromptOrchestrator.get_prefix_version(),
        }
        assert legacy_query != current_query
        assert current_query["prompt_version"] == "2.0.0"
        assert current_query["prefix_version"] == "2.0.0"

    def test_get_cached_uses_current_prefix_default(self):
        import inspect

        sig = inspect.signature(InsightCacheManager.get_cached)
        default_prefix = sig.parameters["prefix_version"].default
        assert default_prefix == DEFAULT_PREFIX_VERSION

    @pytest.mark.asyncio
    async def test_version_mismatch_returns_cache_miss(self):
        """Simulate Mongo lookup: old version doc is invisible to new version query."""

        class FakeCollection:
            def __init__(self):
                self.docs = [
                    {
                        "_id": "legacy",
                        "survey_id": "s1",
                        "component_type": "chart_insight",
                        "component_key": "c1",
                        "prompt_version": "1.1.0",
                        "prefix_version": "1.0.0",
                        "ai_headline": "Old headline",
                        "ai_deep_analysis": [],
                    }
                ]

            async def find_one(self, query):
                for doc in self.docs:
                    if all(doc.get(k) == v for k, v in query.items()):
                        return doc
                return None

            def update_one(self, *args, **kwargs):
                return None

        manager = InsightCacheManager.__new__(InsightCacheManager)
        manager.collection = FakeCollection()

        miss = await manager.get_cached(
            survey_id="s1",
            component_type="chart_insight",
            component_key="c1",
            prompt_version="2.0.0",
            prefix_version="2.0.0",
        )
        assert miss is None

        hit = await manager.get_cached(
            survey_id="s1",
            component_type="chart_insight",
            component_key="c1",
            prompt_version="1.1.0",
            prefix_version="1.0.0",
        )
        assert hit is not None
        assert hit["ai_headline"] == "Old headline"
