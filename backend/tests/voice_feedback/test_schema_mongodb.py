import pytest
from datetime import datetime
from pydantic import ValidationError
from backend.voice_feedback.models import VoiceFeedback, NLPAnalysisResult

def test_voice_feedback_model_valid():
    """Verifies that a complete, valid dictionary correctly instantiates the VoiceFeedback model."""
    valid_data = {
        "id": "507f1f77bcf86cd799439011",
        "survey_id": "survey_123",
        "question_id": "q_001",
        "token": "test-token",
        "audio_grid_id": "grid_abc",
        "transcript": "Hello world",
        "normalized_text": "hello world",
        "language": "en",
        "duration_s": 5.5,
        "status": "completed",
        "nlp_result": {
            "sentiment": "positive",
            "sentiment_scores": {"positive": 0.9, "negative": 0.05, "neutral": 0.05},
            "confidence": 0.95,
            "intent": "praise",
            "aspects": [{"aspect": "taste", "sentiment": "positive"}]
        },
        "created_at": datetime.utcnow()
    }
    
    feedback = VoiceFeedback(**valid_data)
    assert feedback.survey_id == "survey_123"
    assert feedback.nlp_result.sentiment == "positive"
    assert len(feedback.nlp_result.aspects) == 1

def test_voice_feedback_model_invalid_missing_scores():
    """Ensures that missing sentiment_scores triggers a ValidationError."""
    invalid_data = {
        "survey_id": "survey_123",
        "question_id": "q1",
        "token": "t1",
        "nlp_result": {
            "sentiment": "positive",
            # "sentiment_scores" missing
            "confidence": 0.95
        }
    }
    with pytest.raises(ValidationError):
        VoiceFeedback(**invalid_data)

def test_nlp_analysis_result_defaults():
    """Ensures that NLPAnalysisResult enforces required fields."""
    data = {
        "sentiment": "neutral",
        "sentiment_scores": {"positive": 0.1, "negative": 0.1, "neutral": 0.8},
        "confidence": 0.5,
        "intent": "suggestion"
    }
    nlp = NLPAnalysisResult(**data)
    assert nlp.aspects == []
