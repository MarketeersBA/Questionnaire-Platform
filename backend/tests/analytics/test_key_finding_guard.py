"""Key Finding contract enforcement."""
from __future__ import annotations

from backend.analytics_module.src.ai.key_finding_guard import (
    build_fallback_key_finding,
    enforce_key_finding,
    validate_key_finding,
)

# The exact string the production report shipped with.
OFFENDING = (
    "Hero (مثلث) Must Address Critical Taste Perception "
    "and Market Entrenchment to Compete Effectively"
)

TASTE_ATTRS = ["Taste Quality", "Outershape", "Freshness"]
TASTE_MODULES = ["Taste Test"]

CHARTS = [
    {
        "chart_type": "driver_ranking",
        "data": {
            "datasets": [
                {
                    "brand": "Hero",
                    "data": [
                        {"main_attribute": "Outershape", "x": 62.0, "y": 41.0},
                        {"main_attribute": "Taste Quality", "x": 48.0, "y": 33.0},
                    ],
                }
            ]
        },
    },
    {
        "chart_type": "horizontal_bar",
        "data": {
            "labels": ["Hero", "Abu Aouf"],
            "datasets": [{"label": "Preference %", "data": [27.0, 73.0]}],
        },
    },
]


class TestValidateKeyFinding:
    def test_rejects_the_production_offender(self):
        verdict = validate_key_finding(
            OFFENDING,
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        joined = " ".join(verdict.reasons).lower()
        assert "market entrenchment" in joined
        assert "must address" in joined

    def test_rejects_missing_figure(self):
        verdict = validate_key_finding(
            "Taste Quality is the weakest attribute for Hero.",
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        assert any("falsifiable" in r for r in verdict.reasons)

    def test_rejects_unmeasured_attribute(self):
        verdict = validate_key_finding(
            "Hero trails on Packaging Appeal by 18 points.",
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        assert any("actually rated" in r for r in verdict.reasons)

    def test_rejects_compound_demand(self):
        verdict = validate_key_finding(
            "Hero must improve Taste Quality and Freshness by 12 points.",
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        assert any("one driver" in r for r in verdict.reasons)

    def test_rejects_overlong(self):
        long_text = "Hero loses on Taste Quality by 18 points " + "and again " * 20
        verdict = validate_key_finding(
            long_text,
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        assert any("Shorten" in r for r in verdict.reasons)

    def test_accepts_a_compliant_finding(self):
        verdict = validate_key_finding(
            "Hero loses on Taste Quality, trailing Abu Aouf by 18 points.",
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is True, verdict.reasons

    def test_market_language_allowed_when_the_module_ran(self):
        # A brand-health study legitimately discusses market share.
        verdict = validate_key_finding(
            "Hero holds 12% market share, led by Taste Quality.",
            measured_attributes=TASTE_ATTRS,
            modules_used=["Brand Awareness", "Purchase Funnel"],
        )
        assert verdict.ok is True, verdict.reasons

    def test_empty_is_rejected(self):
        assert validate_key_finding("").ok is False


class TestFallback:
    def test_builds_from_chart_data_only(self):
        text = build_fallback_key_finding(
            target_brand="Hero",
            charts=CHARTS,
            survey_objective="Sensory evaluation",
            measured_attributes=TASTE_ATTRS,
        )
        assert "Outershape" in text          # strongest driver
        assert "62%" in text                 # its impact
        assert "Abu Aouf" in text            # preference leader
        assert "73%" in text

    def test_fallback_passes_its_own_validator(self):
        text = build_fallback_key_finding(
            target_brand="Hero",
            charts=CHARTS,
            measured_attributes=TASTE_ATTRS,
        )
        verdict = validate_key_finding(
            text,
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
            max_words=40,
        )
        assert verdict.ok is True, verdict.reasons

    def test_degrades_honestly_without_charts(self):
        text = build_fallback_key_finding(
            target_brand="Hero",
            charts=[],
            survey_objective="Sensory evaluation",
        )
        assert "insufficient measured data" in text


class TestEnforce:
    def test_substitutes_when_generation_violates_contract(self):
        final, verdict = enforce_key_finding(
            OFFENDING,
            target_brand="Hero",
            charts=CHARTS,
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is False
        assert "Market Entrenchment" not in final
        assert "Outershape" in final

    def test_passes_compliant_text_through_untouched(self):
        good = "Hero loses on Taste Quality, trailing Abu Aouf by 18 points."
        final, verdict = enforce_key_finding(
            good,
            target_brand="Hero",
            charts=CHARTS,
            measured_attributes=TASTE_ATTRS,
            modules_used=TASTE_MODULES,
        )
        assert verdict.ok is True
        assert final == good
