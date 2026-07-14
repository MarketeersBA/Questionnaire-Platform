import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from bson import ObjectId
from backend.voice_feedback.analysis_orchestrator import VoiceAnalysisOrchestrator
from backend.database import db

@pytest.fixture
def orchestrator():
    return VoiceAnalysisOrchestrator()

@pytest.mark.asyncio
async def test_full_orchestration_flow(orchestrator):
    """
    Validates that a feedback entry flows through the entire pipeline:
    STT -> Normalize -> NLP -> Embedding -> Persistence.
    Mocks external AI APIs but verifies internal state and DB consistency.
    """
    survey_id = "survey_int_test"
    feedback_id = "feed_123"
    
    # 1. Mock the AI Engines
    with patch("backend.voice_feedback.analysis_orchestrator.transcriber.transcribe", new_callable=AsyncMock) as mock_stt, \
         patch("backend.voice_feedback.analysis_orchestrator.normalizer.normalize", new_callable=AsyncMock) as mock_norm, \
         patch("backend.voice_feedback.analysis_orchestrator.nlp_analyzer.analyze_text", new_callable=AsyncMock) as mock_nlp, \
         patch("backend.voice_feedback.analysis_orchestrator.VoiceAnalysisOrchestrator._get_question_context", new_callable=AsyncMock) as mock_q, \
         patch("backend.voice_feedback.analysis_orchestrator.embedding_engine.get_embeddings", new_callable=AsyncMock) as mock_embed:
        
        # Setup mock returns
        from backend.voice_feedback.models import TranscriptionResult
        mock_stt.return_value = TranscriptionResult(text="El akel kan helw", language="ar", confidence=1.0, duration_s=5.5, segments=[])
        mock_norm.return_value = {"original": "El akel kan helw", "normalized": "الاكل كان حلو", "is_franco": True, "code_switched": False, "primary_language": "ar"}
        mock_q.return_value = "positive feedback"
        
        mock_nlp.return_value = (MagicMock(), {"prompt_tokens": 10, "completion_tokens": 5})
        mock_nlp.return_value[0].model_dump.return_value = {
            "sentiment": "positive",
            "confidence": 0.9,
            "intent": "praise",
            "aspects": [{"aspect": "taste", "sentiment": "positive"}]
        }
        mock_embed.return_value = [[0.1, 0.2, 0.3]]
        
        # 2. Run Orchestration
        feedback_oid = ObjectId() # Create a valid random ObjectId
        feedback_id = str(feedback_oid)
        
        await db.get_collection("voice_feedbacks").insert_one({
            "_id": feedback_oid,
            "survey_id": survey_id,
            "question_id": "q_123",
            "status": "pending",
            "audio_grid_id": str(ObjectId())
        })
        
        await orchestrator.process_single_feedback(feedback_id, "mock_path.webm")
        
        # 3. Verify Database State
        feedback = await db.get_collection("voice_feedbacks").find_one({"_id": feedback_oid})

        assert feedback is not None
        assert feedback["status"] == "completed"
        
        # Verify Transcript vs Normalized Bifurcation (Task Requirement)
        assert feedback["transcript"] == "El akel kan helw"
        assert feedback["normalized_text"] == "الاكل كان حلو"
        assert feedback["is_franco"] is True
        
        # Verify NLP Analysis Integration
        assert feedback["nlp_result"]["sentiment"] == "positive"
        assert feedback["nlp_result"]["intent"] == "praise"
        assert len(feedback["nlp_result"]["aspects"]) > 0
        
        # Verify Cost Accuracy
        assert "cost_usd" in feedback
        assert feedback["cost_usd"] > 0
        assert "token_usage" in feedback
        assert "nlp" in feedback["token_usage"]
        
        # Cleanup
        await db.get_collection("voice_feedbacks").delete_one({"_id": feedback_oid})

def test_orchestrator_initialization(orchestrator):
    """Ensures orchestrator is correctly instantiated."""
    assert orchestrator is not None
    assert orchestrator.semaphore is not None
    assert orchestrator.max_concurrent == 10
