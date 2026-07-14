import asyncio
import time
import os
from unittest.mock import AsyncMock, patch
from backend.voice_feedback.analysis_orchestrator import VoiceAnalysisOrchestrator
from backend.database import db

async def simulate_stress_load(n_concurrent: int = 10):
    """
    Simulates a heavy load on the processing pipeline.
    Processing n_concurrent files simultaneously.
    """
    orchestrator = VoiceAnalysisOrchestrator()
    feedback_ids = [f"stress_test_{i}_{int(time.time())}" for i in range(n_concurrent)]
    
    print(f"🚀 Starting Stress Test: {n_concurrent} concurrent jobs")
    start_time = time.time()

    # Prep DB
    for fid in feedback_ids:
        await db.get_collection("voice_feedbacks").insert_one({
            "_id": fid,
            "survey_id": "STRESS_SURVEY",
            "status": "pending",
            "audio_grid_id": "mock_binary"
        })

    # Mock heavy lifting to avoid costs/network bottlenecks during local stress demo
    with patch("backend.voice_feedback.audio_processor.AudioProcessor.normalize_audio", side_effect=lambda x: x), \
         patch("backend.voice_feedback.transcriber.WhisperTranscriber.transcribe", new_callable=AsyncMock) as mock_stt, \
         patch("backend.voice_feedback.nlp_analyzer.NLPAnalyzer.analyze", new_callable=AsyncMock) as mock_nlp:
        
        # Simulate variable processing times
        mock_stt.side_effect = lambda x: asyncio.sleep(1) or {"text": "Stress test transcript", "language": "en"}
        mock_nlp.side_effect = lambda x: asyncio.sleep(1.5) or {"sentiment": "neutral", "confidence": 0.5}
        
        # Launch concurrent processing
        tasks = [orchestrator.process_feedback(fid, "/tmp/stress_audio.webm") for fid in feedback_ids]
        await asyncio.gather(*tasks)

    duration = time.time() - start_time
    print(f"✅ Stress Test Completed in {duration:.2f}s")
    
    # Verify DB Results
    cursor = db.get_collection("voice_feedbacks").find({"survey_id": "STRESS_SURVEY"})
    items = await cursor.to_list(length=100)
    
    completed = [i for i in items if i["status"] == "completed"]
    print(f"📊 Statistics: {len(completed)}/{n_concurrent} processed successfully")
    
    # Cleanup
    await db.get_collection("voice_feedbacks").delete_many({"survey_id": "STRESS_SURVEY"})

if __name__ == "__main__":
    # To run: python -m backend.tests.voice_feedback.stress_test_pipeline
    asyncio.run(simulate_stress_load(15))
