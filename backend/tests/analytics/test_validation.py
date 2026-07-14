"""Tests for backend.analytics_module.src.config.validation."""
import pytest
from backend.analytics_module.src.config.validation import validate_project_inputs, validate_slides_content

class TestValidateProjectInputs:
    def test_valid_inputs(self, sample_project_inputs):
        errors = validate_project_inputs(sample_project_inputs)
        path_errors = [e for e in errors if "not found" not in e.lower()]
        assert path_errors == []

    def test_missing_keys(self):
        errors = validate_project_inputs({})
        assert len(errors) >= 7
        assert any("dataset_path" in e for e in errors)

    def test_null_value(self):
        inputs = {"dataset_path": None, "study_print_path": "x", "output_dir": "x",
                  "project_name": "x", "sections": [], "screening_cols": [], "pivots_needed": {}}
        errors = validate_project_inputs(inputs)
        assert any("null" in e.lower() for e in errors)

    def test_sections_wrong_type(self):
        inputs = {"dataset_path": "x", "study_print_path": "x", "output_dir": "x",
                  "project_name": "x", "sections": "not_a_list", "screening_cols": [], "pivots_needed": {}}
        errors = validate_project_inputs(inputs)
        assert any("must be a list" in e for e in errors)

class TestValidateSlidesContent:
    def test_empty_config(self):
        errors = validate_slides_content({})
        assert errors == []

    def test_valid_slide(self):
        config = {
            "slides": {
                "slide1": {
                    "section": "Test",
                    "items": {
                        "chart1": {"module": "test_module"}
                    }
                }
            }
        }
        errors = validate_slides_content(config)
        assert errors == []

    def test_missing_module_in_item(self):
        config = {
            "slides": {
                "slide1": {
                    "items": {
                        "chart1": {"section": "Test"}
                    }
                }
            }
        }
        errors = validate_slides_content(config)
        assert len(errors) == 1
        assert "missing 'module'" in errors[0]
