"""Tests for backend.analytics_module.src.common shared utilities."""
import re
import pytest
from backend.analytics_module.src.common import select_target_columns, get_question_type, parse_llm_json, PRICES_PER_TOKEN

class TestSelectTargetColumns:
    def test_match_mode(self):
        cols = ["Q1", "Q2", "AgeGroup", "Q3"]
        rx = re.compile(r"^Q\d+$")
        result = select_target_columns(cols, rx)
        assert result == ["Q1", "Q2", "Q3"]

    def test_search_mode(self):
        cols = ["pre_Q1_suf", "Q2_other", "AgeGroup"]
        rx = re.compile(r"Q\d+")
        result = select_target_columns(cols, rx, use_search=True)
        assert result == ["pre_Q1_suf", "Q2_other"]

    def test_no_matches(self):
        cols = ["A", "B", "C"]
        rx = re.compile(r"^Q")
        assert select_target_columns(cols, rx) == []

    def test_deduplication(self):
        cols = ["Q1", "Q1", "Q2"]
        rx = re.compile(r"^Q")
        result = select_target_columns(cols, rx)
        assert result == ["Q1", "Q2"]

class TestGetQuestionType:
    def test_found(self, sample_meta_data):
        assert get_question_type(sample_meta_data, "Q1") == "Select (Radio Button)"

    def test_not_found(self, sample_meta_data):
        assert get_question_type(sample_meta_data, "NonExistent") is None

    def test_none_column(self, sample_meta_data):
        assert get_question_type(sample_meta_data, None) is None

class TestParseLlmJson:
    def test_plain_json_object(self):
        assert parse_llm_json('{"key": "value"}') == {"key": "value"}

    def test_plain_json_array(self):
        assert parse_llm_json('[1, 2, 3]') == [1, 2, 3]

    def test_markdown_fenced_json(self):
        text = '```json\n{"key": "value"}\n```'
        assert parse_llm_json(text) == {"key": "value"}

    def test_markdown_fenced_no_lang(self):
        text = '```\n[1, 2]\n```'
        assert parse_llm_json(text) == [1, 2]

    def test_json_with_surrounding_text(self):
        text = 'Here is the result:\n[{"a": 1}]\nDone.'
        result = parse_llm_json(text)
        assert result == [{"a": 1}]

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="Empty response"):
            parse_llm_json("")

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError, match="No valid JSON"):
            parse_llm_json("This is not JSON at all")

class TestPricesPerToken:
    def test_known_models_have_input_output(self):
        for model, prices in PRICES_PER_TOKEN.items():
            assert "input" in prices
            assert "output" in prices
            assert prices["input"] > 0
            assert prices["output"] > 0
