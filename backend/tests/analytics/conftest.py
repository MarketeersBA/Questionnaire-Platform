"""Shared fixtures for the analytics test suite."""
import pytest
import pandas as pd



@pytest.fixture
def sample_meta_data():
    return pd.DataFrame({
        "question_name": ["Q1", "Q2", "Q3", "Awareness", "Purchase"],
        "question_type": [
            "Select (Radio Button)",
            "Select (Check Box)",
            "Numeric",
            "Select (Check Box)",
            "Select (Radio Button)",
        ],
        "header": ["Question 1", "Question 2", "Question 3", "Awareness Q", "Purchase Q"],
        "list_name": ["List1", "List2", None, "BrandList", "BrandList"],
        "parent_list": [None, None, None, None, None],
        "loop": [None, None, None, None, None],
    })

@pytest.fixture
def sample_project_inputs():
    return {
        "dataset_path": "test_data.csv",
        "study_print_path": "test_study.txt",
        "output_dir": "test_output",
        "project_name": "test_project",
        "sections": ["Brand Awareness and Purchase Funnel"],
        "screening_cols": ["resp_id"],
        "pivots_needed": {},
        "research_type": "TasteTest",
        "tom": "TOM",
        "unaided": "Unaided",
        "aided": "Aided",
        "brands_list": "BrandList",
        "focus_brands": ["BrandA", "BrandB"],
        "my_brand": "BrandA",
        "my_brands": ["BrandA"],
    }

@pytest.fixture
def sample_df():
    return pd.DataFrame({
        "resp_id": [1, 2, 3, 4, 5],
        "Q1": ["A", "B", "A", "C", "B"],
        "Q2_1": [1, 0, 1, 0, 1],
        "Q2_2": [0, 1, 0, 1, 0],
        "Q3": [10, 20, 30, 40, 50],
    })
