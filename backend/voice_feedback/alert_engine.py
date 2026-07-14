import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from openai import OpenAI

from backend.database import db
from backend.config import settings
from backend.analytics_module.src.ai import AIGuard
from backend.analytics_module.src.ai.utils import stream_json_completion

logger = logging.getLogger(__name__)

class AlertEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.prompt_path = "backend/voice_feedback/nlp_prompts/alert_context.json"

    async def check_for_spike(self, survey_id: str):
        """
        Analyzes the last hour of feedback against a 24h baseline to detect negative spikes.
        """
        collection = db.get_collection("voice_feedbacks")
        
        # 1. Calculate Baseline (Last 24 hours excluding last 1 hour)
        now = datetime.utcnow()
        hour_ago = now - timedelta(hours=1)
        day_ago = now - timedelta(hours=24)
        
        baseline_query = {
            "survey_id": survey_id,
            "status": "completed",
            "created_at": {"$gte": day_ago, "$lt": hour_ago}
        }
        
        total_baseline = await collection.count_documents(baseline_query)
        neg_baseline = await collection.count_documents({**baseline_query, "nlp_result.sentiment": "negative"})
        
        baseline_rate = neg_baseline / total_baseline if total_baseline > 0 else 0.1 # Fallback to 10%
        
        # 2. Calculate Current Rate (Last 1 hour)
        current_query = {
            "survey_id": survey_id,
            "status": "completed",
            "created_at": {"$gte": hour_ago}
        }
        
        total_current = await collection.count_documents(current_query)
        if total_current < 5: # Need a minimum sample size to alert
            return
            
        neg_current = await collection.count_documents({**current_query, "nlp_result.sentiment": "negative"})
        current_rate = neg_current / total_current
        
        # 3. Detection Logic: Spike or Threshold
        is_spike = current_rate > (baseline_rate * 2) and (current_rate - baseline_rate) > 0.2
        is_high_threshold = current_rate > 0.6 # configurable default
        
        if is_spike or is_high_threshold:
            logger.warning(f"NEGATIVE SPIKE DETECTED for {survey_id}: {current_rate*100}% negative")
            await self._trigger_alert(survey_id, current_rate, current_query)

    async def _trigger_alert(self, survey_id: str, rate: float, query: Dict[str, Any]):
        """Generates context for the alert and persists it."""
        collection = db.get_collection("voice_feedbacks")
        
        # Fetch a few samples for context
        samples_cursor = collection.find({**query, "nlp_result.sentiment": "negative"}).limit(5)
        samples = []
        async for s in samples_cursor:
            samples.append(s.get("normalized_text", s.get("transcript", "")))
            
        # Generate context message via LLM
        with open(self.prompt_path, "r", encoding="utf-8") as f:
            prompt_data = json.load(f)
            
        user_content = prompt_data["user_template"].format(
            survey_id=survey_id,
            negative_samples="\n- ".join(samples)
        )
        
        async def _call_api():
            response = await stream_json_completion(
                client=self.client,
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": prompt_data["god_prompt"]},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=150,
                temperature=0.3
            )
            return response.choices[0].message.content

        try:
            message = await AIGuard.wrap_call_async(
                slide_id=f"alert_{survey_id}",
                func=_call_api
            )
            
            # Persist Alert
            alert_doc = {
                "survey_id": survey_id,
                "type": "negative_spike",
                "severity": "high" if rate > 0.6 else "medium",
                "message": message,
                "negative_rate": rate,
                "detected_at": datetime.utcnow(),
                "is_resolved": False
            }
            
            await db.get_collection("voice_alerts").insert_one(alert_doc)
            
            # TODO: Integrate with Redis PubSub for real-time frontend push
            # redis.publish(f"alerts:{survey_id}", json.dumps(alert_doc))
            
        except Exception as e:
            logger.error(f"Alert context generation failed: {e}")

# Global instance
alert_engine = AlertEngine()
