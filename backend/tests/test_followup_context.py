"""Tests for FollowUpEngineContext assembly."""

from backend.voice_feedback.followup_context import FollowUpEngineContext


def test_from_survey_request_builds_normalized_context():
    survey = {
        "type": "taste_test",
        "company_name": "Acme Foods",
        "survey_objective": "Understand taste drivers",
    }
    ctx = FollowUpEngineContext.from_survey_request(
        survey=survey,
        survey_id="507f1f77bcf86cd799439011",
        token="tok-abc",
        question_id="q_like",
        current_round=2,
        source="text",
        question_text="What did you like?",
        answer_text="It tasted creamy",
        question_category="likes",
        brand_name="BrandA",
        survey_objective=None,
        custom_instructions="Probe on texture",
        respondent_surface="taste_l2_open_end",
        previous_turns=[{"role": "user", "content": "sweet"}],
    )
    assert ctx.survey_type == "taste_test"
    assert ctx.respondent_surface == "taste_l2_open_end"
    assert ctx.question_category == "likes"
    assert ctx.brand_name == "BrandA"
    assert ctx.survey_objective == "Understand taste drivers"
    assert ctx.custom_instructions == "Probe on texture"
    assert ctx.survey_id == "507f1f77bcf86cd799439011"
    assert ctx.token == "tok-abc"
    assert ctx.question_id == "q_like"
    assert ctx.current_round == 2
    assert ctx.source == "text"
    assert len(ctx.previous_turns) == 1
