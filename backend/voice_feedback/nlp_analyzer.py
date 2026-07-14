import json
import logging
from typing import Dict, Any, Optional
from openai import OpenAI
from backend.config import settings
from backend.voice_feedback.models import NLPAnalysisResult
from backend.analytics_module.src.ai import AIGuard, api_cost
from backend.analytics_module.src.ai.utils import stream_json_completion

logger = logging.getLogger(__name__)

class NLPAnalyzer:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.prompt_path = "backend/voice_feedback/nlp_prompts/combined_analysis.json"
        self._load_prompts()

    def _load_prompts(self):
        try:
            with open(self.prompt_path, "r", encoding="utf-8") as f:
                self.prompt_data = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load NLP prompts: {e}")
            self.prompt_data = {}

    async def analyze_text(self, text: str, question_context: str = "general feedback") -> tuple[NLPAnalysisResult, Dict[str, Any]]:
        """
        Runs the combined sentiment, aspect, and intent analysis using GPT-4o.
        Returns (result, usage_info).
        """
        if not text or not text.strip():
             return self._get_empty_result(), {}

        god_prompt = self.prompt_data.get("god_prompt", "You are an AI analyst.")
        user_template = self.prompt_data.get("user_template", "Analyze: {text}")
        
        user_content = user_template.format(text=text, question_context=question_context)
        
        messages = [
            {"role": "system", "content": god_prompt},
            {"role": "user", "content": user_content}
        ]

        async def _call_api():
            response = await stream_json_completion(
                client=self.client,
                model="gpt-4o",
                messages=messages,
                max_tokens=1000,
                temperature=0
            )
            
            # Record global cost
            api_cost.add_from_openai_response(
                component="voice_nlp_analysis",
                model="gpt-4o",
                response=response,
                duration_ms=response.duration_ms
            )
            
            return {
                "content": response.choices[0].message.content,
                "usage": getattr(response, "usage", None)
            }

        try:
            res = await AIGuard.wrap_call_async(
                slide_id="voice_nlp_item",
                func=_call_api
            )
            
            if res == AIGuard.FALLBACK_MSG:
                return self._get_empty_result(), {}

            raw_json = res["content"]
            usage = res["usage"]
            
            # Calculate local usage dict
            usage_dict = {}
            if usage:
                pt, ct = api_cost._default._usage_to_prompt_completion_tokens(usage)
                usage_dict = {
                    "prompt_tokens": pt,
                    "completion_tokens": ct,
                    "total_tokens": pt + ct,
                    "model": "gpt-4o"
                }

            data = json.loads(raw_json)
            
            result = NLPAnalysisResult(
                sentiment=data.get("sentiment", {}).get("overall", "neutral"),
                sentiment_scores=data.get("sentiment", {}).get("scores", {"positive": 0, "negative": 0, "neutral": 1.0}),
                aspects=data.get("aspects", []),
                intent=data.get("intent", "other"),
                confidence=data.get("confidence", 0.0)
            )
            return result, usage_dict

        except Exception as e:
            logger.error(f"NLP analysis failed: {e}")
            return self._get_empty_result(), {}

    def _get_empty_result(self) -> NLPAnalysisResult:
        return NLPAnalysisResult(
            sentiment="neutral",
            sentiment_scores={"positive": 0, "negative": 0, "neutral": 0},
            aspects=[],
            intent="unknown",
            confidence=0.0
        )

# Global instance
nlp_analyzer = NLPAnalyzer()
