"""
Language resolution for schema composition.

Question text is baked into `template_snapshot_schema` when a survey is created,
so choosing the wrong language here is permanent for respondents — no render-time
fix is possible. The original resolver read `product_test_config.language` first
for EVERY survey type. Switching survey type in the wizard leaves a stale
`product_test_config` (defaulting to "en") on the form, so a taste test set to
Arabic was composed in English.
"""

import pytest

from backend.services.product_test_orchestration import resolve_orchestration_language


def test_taste_test_uses_its_own_language_over_a_stale_product_config():
    """The exact reported bug: Arabic taste test rendered in English."""
    survey = {
        "type": "taste_test",
        "taste_test_config": {"language": "ar"},
        # Left behind by switching survey type in the wizard.
        "product_test_config": {"language": "en"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_product_test_uses_its_own_language_over_a_stale_taste_config():
    survey = {
        "type": "product_test",
        "product_test_config": {"language": "ar"},
        "taste_test_config": {"language": "en"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_product_test_detected_from_modules_when_type_is_unset():
    survey = {
        "selected_modules": ["product_test"],
        "product_test_config": {"language": "ar"},
        "taste_test_config": {"language": "en"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_module_sequence_also_marks_a_product_test():
    survey = {
        "module_sequence": ["screening", "product_test"],
        "product_test_config": {"language": "ar"},
        "taste_test_config": {"language": "en"},
    }
    assert resolve_orchestration_language(survey) == "ar"


@pytest.mark.parametrize("survey_type", ["taste_test", "brand_awareness", "usage_attitude", ""])
def test_non_product_surveys_fall_back_to_generic_config(survey_type):
    survey = {"type": survey_type, "config": {"language": "ar"}}
    assert resolve_orchestration_language(survey) == "ar"


def test_falls_back_across_configs_when_the_matching_one_is_silent():
    """A survey with no type-specific language still resolves."""
    survey = {"type": "taste_test", "product_test_config": {"language": "ar"}}
    assert resolve_orchestration_language(survey) == "ar"


def test_defaults_to_english_when_nothing_is_set():
    assert resolve_orchestration_language({}) == "en"
    assert resolve_orchestration_language({"type": "taste_test"}) == "en"


def test_empty_language_values_are_ignored():
    survey = {
        "type": "taste_test",
        "taste_test_config": {"language": ""},
        "config": {"language": "ar"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_none_configs_do_not_crash():
    survey = {"type": "taste_test", "taste_test_config": None, "product_test_config": None}
    assert resolve_orchestration_language(survey) == "en"
