import asyncio
import logging
from typing import List, Optional, Dict, Any
from bson import ObjectId
from datetime import datetime

from backend.database import db
from backend.voice_feedback.transcriber import transcriber
from backend.voice_feedback.text_normalizer import normalizer
from backend.voice_feedback.nlp_analyzer import nlp_analyzer
from backend.voice_feedback.embedding_engine import embedding_engine
from backend.analytics_module.src.ai import api_cost

logger = logging.getLogger(__name__)

class VoiceAnalysisOrchestrator:
    def __init__(self):
        self.max_concurrent = 10
        self.semaphore = asyncio.Semaphore(self.max_concurrent)

    async def process_single_feedback(self, feedback_id: str, file_path: Optional[str] = None):
        """
        Full pipeline for a single feedback item.
        If file_path is provided, it runs STT first.
        Otherwise, it assumes transcription is already done (or downloads from GridFS).
        """
        async with self.semaphore:
            collection = db.get_collection("voice_feedbacks")
            try:
                # 1. Load feedback state
                feedback = await collection.find_one({"_id": ObjectId(feedback_id)})
                if not feedback:
                    logger.error(f"Feedback {feedback_id} not found")
                    return

                # 2. Transcription (if needed)
                stt_text = feedback.get("transcript")
                stt_data = feedback.get("stt_result")
                
                if file_path:
                    stt_result = await transcriber.transcribe(file_path)
                    stt_text = stt_result.text
                    stt_data = stt_result.model_dump()
                elif not stt_text and feedback.get("audio_grid_id"):
                    # Download from GridFS and transcribe if missing
                    # (Implementation for reprocessing path)
                    bucket = db.get_gridfs_bucket()
                    temp_path = f"tmp/audio/orch_{feedback_id}"
                    with open(temp_path, "wb") as f:
                        await bucket.download_to_stream(ObjectId(feedback["audio_grid_id"]), f)
                    
                    stt_result = await transcriber.transcribe(temp_path)
                    stt_text = stt_result.text
                    stt_data = stt_result.model_dump()
                
                if not stt_text or len(stt_text.strip()) == 0:
                    logger.warning(f"Voice Analysis Orchestrator: Blank or malformed audio submitted for {feedback_id}")
                    await collection.update_one(
                        {"_id": ObjectId(feedback_id)},
                        {
                            "$set": {
                                "status": "completed",
                                "transcript": "",
                                "normalized_text": "",
                                "is_blank": True,
                                "quality": "thin", 
                                "processed_at": datetime.utcnow()
                            }
                        }
                    )
                    return

                # 3. Normalization
                norm_result = await normalizer.normalize(stt_text)
                normalized_text = norm_result["normalized"]

                # 4. Filter Check (Scoping to specific context)
                question_context = await self._get_question_context(feedback["question_id"])

                # 5. NLP Analysis
                nlp_result, nlp_usage = await nlp_analyzer.analyze_text(
                    text=normalized_text,
                    question_context=question_context
                )

                # 6. Embedding Generation
                embedding = (await embedding_engine.get_embeddings([normalized_text]))[0]

                # 7. Calculate Costs Precisely
                # Whisper STT: $0.006/min = $0.0001/sec
                whisper_duration = stt_data.get("duration_s", 0) if isinstance(stt_data, dict) else (getattr(stt_data, "duration_s", 0) if stt_data else 0)
                whisper_cost = whisper_duration * 0.0001
                
                # NLP GPT-4o Cost:
                nlp_cost = api_cost.calculate_cost("voice_nlp_analysis", "gpt-4o", nlp_usage.get("prompt_tokens", 0), nlp_usage.get("completion_tokens", 0))
                
                # Embedding text-embedding-3-small Cost Approximation (Since global tally handles precise billing):
                embed_tokens = max(1, len(normalized_text) // 4)
                embed_cost = api_cost.calculate_cost("voice_embedding", "text-embedding-3-small", embed_tokens, 0)
                
                total_cost = whisper_cost + nlp_cost + embed_cost
                token_usage = {
                    "stt": {"duration_s": whisper_duration, "cost_usd": whisper_cost},
                    "nlp": dict(nlp_usage, cost_usd=nlp_cost),
                    "embedding": {"estimated_tokens": embed_tokens, "cost_usd": embed_cost}
                }

                # 8. Atomic Persistence
                await collection.update_one(
                    {"_id": ObjectId(feedback_id)},
                    {
                        "$set": {
                            "status": "completed",
                            "transcript": stt_text,
                            "normalized_text": normalized_text,
                            "stt_result": stt_data,
                            "nlp_result": nlp_result.model_dump(),
                            "embedding": embedding,
                            "cost_usd": total_cost,
                            "token_usage": token_usage,
                            "is_franco": norm_result["is_franco"],
                            "code_switched": norm_result["code_switched"],
                            "language": norm_result["primary_language"],
                            "processed_at": datetime.utcnow()
                        }
                    }
                )
                logger.info(f"Successfully processed voice feedback {feedback_id}")

            except Exception as e:
                logger.error(f"Orchestration failed for {feedback_id}: {e}")
                await collection.update_one(
                    {"_id": ObjectId(feedback_id)},
                    {"$set": {"status": "failed", "error_message": str(e)}}
                )

    async def _get_question_context(self, question_id: str) -> str:
        """Determines if the question is about Likes, Dislikes, Recommendations, or Overall."""
        # Check master_questions or structural_questions
        for col_name in ["master_questions", "structural_questions", "taste_test_questions"]:
            q = await db.get_collection(col_name).find_one({"question_id": question_id})
            if q:
                text = (q.get("question_text") or q.get("en_text") or "").lower()
                if any(word in text for word in ["like", "enjoy", "appreciate", "positive", "تحب", "اعجبك", "يعجبك"]):
                    return "likes"
                if any(word in text for word in ["dislike", "hate", "negative", "didn't like", "كرهت", "لم يعجبك"]):
                    return "dislikes"
                if any(word in text for word in ["suggest", "improve", "recommend", "change", "اقترح", "تحسين", "توصية"]):
                    return "suggestions"
                if any(word in text for word in ["overall", "general", "think", "feel", "عام", "رأيك", "شعورك"]):
                    return "overall"
        return "general"

    async def process_batch(self, feedback_ids: List[str]):
        """Runs the pipeline in parallel for multiple items."""
        tasks = [self.process_single_feedback(fid) for fid in feedback_ids]
        await asyncio.gather(*tasks)

# Global instance
orchestrator = VoiceAnalysisOrchestrator()
