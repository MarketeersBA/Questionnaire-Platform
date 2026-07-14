import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from openai import OpenAI
from backend.config import settings
from backend.database import db
from backend.analytics_module.src.ai import AIGuard, api_cost
from backend.analytics_module.src.ai.utils import stream_json_completion

logger = logging.getLogger(__name__)

class VoiceReportSynthesizer:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.prompt_path = "backend/voice_feedback/nlp_prompts/report_synthesis.json"

    async def generate_report(self, survey_id: str) -> Dict[str, Any]:
        """
        Aggregates feedback data and synthesizes a business report using an LLM.
        """
        # 1. Aggregate Data
        collection = db.get_collection("voice_feedbacks")
        cluster_col = db.get_collection("feedback_clusters")
        
        # Sentiment/Aspect aggregation
        cursor = collection.aggregate([
            {"$match": {"survey_id": survey_id, "status": "completed"}},
            {"$facet": {
                "sentiment": [{"$group": {"_id": "$nlp_result.sentiment", "count": {"$sum": 1}}}],
                "intents": [{"$group": {"_id": "$nlp_result.intent", "count": {"$sum": 1}}}],
                "aspects": [
                    {"$unwind": "$nlp_result.aspects"},
                    {"$group": {"_id": "$nlp_result.aspects.aspect", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1}},
                    {"$limit": 10}
                ]
            }}
        ])
        agg_data = await cursor.to_list(length=1)
        if not agg_data:
            return {"error": "No data available for report"}
        
        agg = agg_data[0]
        
        # Clusters Summary
        clusters_cursor = cluster_col.find({"survey_id": survey_id}).sort("size", -1).limit(5)
        clusters = []
        async for c in clusters_cursor:
            clusters.append({
                "label": c["label"],
                "size": c["size"],
                "keywords": c["top_keywords"],
                "sentiment": c.get("dominant_sentiment")
            })

        # 2. Prepare Prompt
        with open(self.prompt_path, "r", encoding="utf-8") as f:
            prompt_data = json.load(f)
            
        total_count = await collection.count_documents({"survey_id": survey_id, "status": "completed"})
        
        user_content = prompt_data["user_template"].format(
            survey_id=survey_id,
            total_count=total_count,
            sentiment_dist=json.dumps(agg["sentiment"]),
            top_aspects=json.dumps(agg["aspects"]),
            clusters_summary=json.dumps(clusters),
            intent_breakdown=json.dumps(agg["intents"])
        )

        # 3. LLM Request
        async def _call_api():
            response = await stream_json_completion(
                client=self.client,
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": prompt_data["god_prompt"]},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=2000,
                temperature=0.4
            )
            return response.choices[0].message.content

        try:
            raw_json = await AIGuard.wrap_call_async(
                slide_id=f"report_{survey_id}",
                func=_call_api
            )
            report = json.loads(raw_json)
            
            # Store in DB
            report["survey_id"] = survey_id
            report["generated_at"] = datetime.utcnow()
            await db.get_collection("feedback_reports").update_one(
                {"survey_id": survey_id},
                {"$set": report},
                upsert=True
            )
            
            return report
        except Exception as e:
            logger.error(f"Report synthesis failed: {e}")
            return {"error": str(e)}

# Global instance
report_synthesizer = VoiceReportSynthesizer()
