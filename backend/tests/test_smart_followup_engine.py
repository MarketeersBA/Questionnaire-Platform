"""Tests for SmartFollowUpEngine behavior."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from backend.voice_feedback.followup_context import FollowUpEngineContext
from backend.voice_feedback.smart_followup import SmartFollowUpEngine, _PROMPT_PATH


def _sample_context(**overrides) -> FollowUpEngineContext:
    base = dict(
        question="What did you like?",
        answer="It was creamy and smooth",
        brand_name="BrandA",
        survey_objective="Taste drivers",
        custom_instructions="",
        question_category="likes",
        survey_type="taste_test",
        respondent_surface="taste_l2_open_end",
        survey_id="507f1f77bcf86cd799439011",
        token="tok-1",
        question_id="BrandA_q1",
        current_round=1,
        source="text",
    )
    base.update(overrides)
    return FollowUpEngineContext(**base)


def test_prompt_file_loads_from_package_relative_path():
    engine = SmartFollowUpEngine(api_key="test-key")
    assert _PROMPT_PATH.exists()
    assert "god_prompt" in engine.prompt_data
    assert "user_template" in engine.prompt_data
    with open(_PROMPT_PATH, encoding="utf-8") as handle:
        raw = json.load(handle)
    assert "one concise" in raw["god_prompt"].lower() or "ONE concise" in raw["god_prompt"]


@pytest.mark.asyncio
async def test_missing_api_key_returns_complete_without_crash():
    engine = SmartFollowUpEngine(api_key="")
    result = await engine.evaluate_and_followup(context=_sample_context())
    assert result["action"] == "complete"
    assert "API key" in result["reasoning"]


@pytest.mark.asyncio
async def test_short_answer_skips_openai_call():
    engine = SmartFollowUpEngine(api_key="fake-key")
    result = await engine.evaluate_and_followup(context=_sample_context(answer="hi"))
    assert result["action"] == "complete"
    assert "too short" in result["reasoning"].lower()


@pytest.mark.asyncio
@patch("backend.voice_feedback.smart_followup.AIGuard.wrap_call_async", new_callable=AsyncMock)
@patch("backend.voice_feedback.smart_followup.stream_json_completion", new_callable=AsyncMock)
async def test_engine_passes_dedup_key_and_survey_id(mock_stream, mock_guard):
    async def _run_guarded_call(slide_id, func, *args, **kwargs):
        return await func()

    mock_guard.side_effect = _run_guarded_call

    payload = {
        "action": "probe",
        "followup_text": "What made it creamy?",
        "key_insights": ["creamy texture"],
        "reasoning": "thin",
    }

    class _FakeMessage:
        content = json.dumps(payload)

    class _FakeChoice:
        message = _FakeMessage()

    class _FakeResponse:
        choices = [_FakeChoice()]
        duration_ms = 12

    mock_stream.return_value = _FakeResponse()

    engine = SmartFollowUpEngine(api_key="fake-key")
    ctx = _sample_context()
    result = await engine.evaluate_and_followup(context=ctx)

    assert result["action"] == "probe"
    mock_guard.assert_awaited_once()
    kwargs = mock_guard.await_args.kwargs
    assert kwargs["dedup_key"].startswith("smart_followup:")
    assert kwargs["survey_id"] == ctx.survey_id
    assert kwargs["slide_id"] == "smart_followup_round"

    call_kwargs = mock_stream.await_args.kwargs
    assert call_kwargs["response_format"] is not None
    messages = call_kwargs["messages"]
    assert messages[0]["role"] == "system"
    user_content = messages[1]["content"]
    assert "taste_test" in user_content
    assert "taste_l2_open_end" in user_content


@pytest.mark.asyncio
@patch("backend.voice_feedback.smart_followup.settings")
@patch("backend.voice_feedback.smart_followup.AIGuard.wrap_call_async", new_callable=AsyncMock)
@patch("backend.voice_feedback.smart_followup.stream_json_completion", new_callable=AsyncMock)
async def test_engine_uses_settings_openai_model(mock_stream, mock_guard, mock_settings):
    mock_settings.OPENAI_MODEL = "gpt-4.1-mini"

    async def _run_guarded_call(slide_id, func, *args, **kwargs):
        return await func()

    mock_guard.side_effect = _run_guarded_call
    mock_stream.return_value = type(
        "Resp",
        (),
        {
            "choices": [type("C", (), {"message": type("M", (), {"content": json.dumps({
                "action": "complete",
                "followup_text": None,
                "key_insights": [],
                "reasoning": "enough detail",
            })})()})()],
            "duration_ms": 5,
        },
    )()

    engine = SmartFollowUpEngine(api_key="fake-key")
    await engine.evaluate_and_followup(context=_sample_context())

    assert mock_stream.await_args.kwargs["model"] == "gpt-4.1-mini"


@pytest.mark.asyncio
@patch("backend.voice_feedback.smart_followup.AIGuard.wrap_call_async", new_callable=AsyncMock)
@patch("backend.voice_feedback.smart_followup.stream_json_completion", new_callable=AsyncMock)
async def test_engine_returns_structured_fallback_on_api_failure(mock_stream, mock_guard):
    async def _run_guarded_call(slide_id, func, *args, **kwargs):
        return await func()

    mock_guard.side_effect = _run_guarded_call
    mock_stream.side_effect = RuntimeError("OpenAI timeout")

    engine = SmartFollowUpEngine(api_key="fake-key")
    result = await engine.evaluate_and_followup(context=_sample_context())

    assert result["action"] == "complete"
    assert result["followup_text"] is None
    assert result["key_insights"] == []
    assert "Backend exception" in result["reasoning"]


@pytest.mark.asyncio
@patch("backend.voice_feedback.smart_followup.AIGuard.wrap_call_async", new_callable=AsyncMock)
@patch("backend.voice_feedback.smart_followup.stream_json_completion", new_callable=AsyncMock)
async def test_engine_returns_structured_fallback_when_aiguard_quota_exhausted(mock_stream, mock_guard):
    from backend.analytics_module.src.ai import AIGuard

    mock_guard.return_value = AIGuard.FALLBACK_MSG

    engine = SmartFollowUpEngine(api_key="fake-key")
    result = await engine.evaluate_and_followup(context=_sample_context())

    assert result["action"] == "complete"
    assert result["followup_text"] is None
    assert "quota" in result["reasoning"].lower()
    mock_stream.assert_not_called()
