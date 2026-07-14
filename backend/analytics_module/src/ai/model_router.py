"""
Model Router — Intelligent AI model selection per component.

Maps each AI component to a model tier (full / mini) and resolves
the concrete model name at runtime. Enables cost optimization by
routing low-stakes components to cheaper models while preserving
quality on high-stakes ones.

Usage:
    from backend.analytics_module.src.ai.model_router import ModelRouter
    router = ModelRouter(base_model="gpt-4o")
    model = router.resolve("slide_insights")  # → "gpt-4.1-mini"
    model = router.resolve("chart_insights")  # → "gpt-4o"
"""
from __future__ import annotations

import logging
import os
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------
class ModelTier:
    FULL = "full"    # High-stakes: chart insights, executive summary, recommendations
    MINI = "mini"    # Low-stakes: slide narration, hero summary, verbatim synthesis


# ---------------------------------------------------------------------------
# Component → Tier mapping
# ---------------------------------------------------------------------------
_DEFAULT_TIER_MAP: Dict[str, str] = {
    # HIGH-STAKES — keep on full model (gpt-4o / gpt-4.1)
    "chart_insights":      ModelTier.FULL,
    "executive_summary":   ModelTier.FULL,
    "recommendations":     ModelTier.FULL,
    "verbatim":            ModelTier.FULL,

    # LOW-STAKES — route to mini model for cost savings
    "insights":            ModelTier.MINI,   # Slide-level narrations (1-2 sentences)
    "executive_hero":      ModelTier.MINI,   # Top-3 takeaway bullet points
    "verbatim_synthesis":  ModelTier.MINI,   # Cross-brand 1-sentence headline
}


# ---------------------------------------------------------------------------
# Model family → mini variant lookup
# ---------------------------------------------------------------------------
_MINI_VARIANTS: Dict[str, str] = {
    "gpt-4o":        "gpt-4.1-mini",
    "gpt-4o-mini":   "gpt-4o-mini",    # Already mini — no change
    "gpt-4.1":       "gpt-4.1-mini",
    "gpt-4.1-mini":  "gpt-4.1-mini",   # Already mini — no change
}


class ModelRouter:
    """
    Resolves the optimal model for each AI component based on a tiered
    routing strategy. Supports env-var overrides for testing.

    Env overrides:
        AI_MODEL_TIER_OVERRIDE=all_mini   → forces ALL components to mini
        AI_MODEL_TIER_OVERRIDE=all_full   → forces ALL components to full
    """

    def __init__(self, base_model: str, tier_map: Optional[Dict[str, str]] = None):
        self.base_model = base_model
        self.tier_map = tier_map or _DEFAULT_TIER_MAP.copy()
        self._mini_model = self._resolve_mini(base_model)

        # Check for env override
        override = os.getenv("AI_MODEL_TIER_OVERRIDE", "").strip().lower()
        if override == "all_mini":
            logger.info("[ModelRouter] ENV override: forcing ALL components to mini model (%s)", self._mini_model)
            self._force_tier = ModelTier.MINI
        elif override == "all_full":
            logger.info("[ModelRouter] ENV override: forcing ALL components to full model (%s)", self.base_model)
            self._force_tier = ModelTier.FULL
        else:
            self._force_tier = None

    @staticmethod
    def _resolve_mini(base_model: str) -> str:
        """Map a base model name to its mini equivalent."""
        # Exact match first
        if base_model in _MINI_VARIANTS:
            return _MINI_VARIANTS[base_model]

        # Prefix match for versioned model names (e.g., gpt-4o-2024-05-13)
        for prefix, mini in _MINI_VARIANTS.items():
            if base_model.startswith(prefix):
                return mini

        # Unknown model family — stay on base (safe fallback)
        logger.warning("[ModelRouter] Unknown model family '%s'. Cannot determine mini variant.", base_model)
        return base_model

    def resolve(self, component: str) -> str:
        """
        Returns the concrete model name for the given component.

        Args:
            component: AI component ID (e.g., 'chart_insights', 'insights')

        Returns:
            Model name string (e.g., 'gpt-4o' or 'gpt-4.1-mini')
        """
        # Env override takes precedence
        if self._force_tier == ModelTier.MINI:
            return self._mini_model
        if self._force_tier == ModelTier.FULL:
            return self.base_model

        tier = self.tier_map.get(component, ModelTier.FULL)
        if tier == ModelTier.MINI:
            return self._mini_model
        return self.base_model

    def get_routing_summary(self) -> Dict[str, str]:
        """Returns a dict of {component: resolved_model} for telemetry."""
        return {comp: self.resolve(comp) for comp in self.tier_map}
