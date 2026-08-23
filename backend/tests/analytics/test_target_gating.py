"""
Target-gating unit tests.

NOTE: this previously tested a phantom `AnalyticsService(db, config).get_target_status()`
API that never existed in `backend/services/analytics_service.py` (that class takes no
constructor args and has no such method) — these tests could never have passed and were
stale. Target-gating actually lives in `backend/services/quota_enforcement.py`
(`resolve_respondent_target`, `compute_target_reached`), consumed inline by
`backend/routers/responses.py`. Testing the real functions directly below.
"""
from backend.services.quota_enforcement import compute_target_reached, resolve_respondent_target


def test_target_reached_calculation():
    survey = {"survey_id": "s1", "respondent_target": 100}
    target = resolve_respondent_target(survey)
    assert target == 100
    assert compute_target_reached(target, quota_current=105) is True


def test_target_not_reached():
    survey = {"survey_id": "s1", "respondent_target": 100}
    target = resolve_respondent_target(survey)
    assert target == 100
    assert compute_target_reached(target, quota_current=5) is False


def test_target_falls_back_to_sample_capacity_when_unset():
    survey = {"survey_id": "s1", "sample_capacity": 50}
    assert resolve_respondent_target(survey) == 50


def test_unset_target_never_reached():
    # A target of 0 (unset) has no finish line — never "reached", regardless of count.
    assert compute_target_reached(quota_target=0, quota_current=999) is False
