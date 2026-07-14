import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from openai import OpenAI

from backend.analytics_module.src.ai import AIGuard, api_cost
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.analytics_module.src.ai.utils import stream_json_completion
from backend.config import settings
from backend.voice_feedback.followup_context import FollowUpEngineContext
from backend.voice_feedback.followup_dedup import build_followup_dedup_key

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent / "nlp_prompts" / "smart_followup.json"
_MIN_ANSWER_LENGTH = 5


def _complete_response(reasoning: str) -> Dict[str, Any]:
    return {
        "action": "complete",
        "reasoning": reasoning,
        "followup_text": None,
        "key_insights": [],
    }


class SmartFollowUpEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key if api_key is not None else settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key) if self.api_key else None
        self.prompt_data = self._load_prompts()

    def _load_prompts(self) -> dict[str, Any]:
        try:
            with open(_PROMPT_PATH, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception as exc:
            logger.error("Failed to load smart followup prompts from %s: %s", _PROMPT_PATH, exc)
            return {
                "god_prompt": "You are a professional survey moderator.",
                "user_template": (
                    "Question Category: {question_category}\n"
                    "Answer: {answer}\n"
                    "History:\n{conversation_history}"
                ),
            }

    @staticmethod
    def _unpack_context(
        context: Optional[FollowUpEngineContext],
        *,
        question: str,
        answer: str,
        previous_turns: Optional[list],
        brand_name: str,
        survey_objective: str,
        language: str,
        custom_instructions: str,
        question_category: str,
        survey_type: str,
        respondent_surface: Optional[str],
    ) -> FollowUpEngineContext:
        if context is not None:
            return context
        return FollowUpEngineContext(
            question=question,
            answer=answer,
            brand_name=brand_name,
            survey_objective=survey_objective,
            custom_instructions=custom_instructions,
            question_category=question_category,
            survey_type=survey_type,
            respondent_surface=respondent_surface,
            previous_turns=list(previous_turns or []),
            language=language,
        )

    def _build_conversation_history(self, question: str, previous_turns: list[dict[str, Any]]) -> str:
        lines = [f"Q: {question}"]
        for turn in previous_turns:
            role = "Respondent" if turn.get("role") == "user" else "Moderator"
            lines.append(f"{role}: {turn.get('content', '')}")
        return "\n".join(lines).strip()

    def _build_messages(self, ctx: FollowUpEngineContext) -> list[dict[str, str]]:
        god_prompt = self.prompt_data.get("god_prompt", "")
        user_template = self.prompt_data.get("user_template", "")
        custom_text = (
            f"ANALYST INSTRUCTIONS:\n{ctx.custom_instructions}"
            if ctx.custom_instructions and ctx.custom_instructions.strip()
            else ""
        )
        user_content = user_template.format(
            answer=ctx.answer,
            conversation_history=self._build_conversation_history(ctx.question, ctx.previous_turns),
            brand_name=ctx.brand_name,
            objective=ctx.survey_objective,
            language=ctx.language,
            custom_instructions=custom_text,
            question_category=ctx.question_category,
            survey_type=ctx.survey_type,
            respondent_surface=ctx.respondent_surface or "unknown",
            current_round=ctx.current_round,
        )
        return [
            {"role": "system", "content": god_prompt},
            {"role": "user", "content": user_content},
        ]

    def _build_dedup_key(self, ctx: FollowUpEngineContext) -> str:
        if not ctx.token and not ctx.question_id:
            return ""
        return build_followup_dedup_key(
            survey_id=ctx.survey_id,
            token=ctx.token,
            question_id=ctx.question_id,
            current_round=ctx.current_round,
            source=ctx.source,
            answer_text=ctx.answer,
        )

    async def evaluate_and_followup(
        self,
        question: str = "",
        answer: str = "",
        previous_turns: Optional[list] = None,
        brand_name: str = "the product",
        survey_objective: str = "general market research",
        language: str = "auto",
        custom_instructions: str = "",
        question_category: str = "general",
        survey_type: str = "standard",
        respondent_surface: Optional[str] = None,
        context: Optional[FollowUpEngineContext] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates answer quality and optionally returns a probing follow-up question.
        Uses settings.OPENAI_API_KEY / settings.OPENAI_MODEL — never reads .env directly.
        """
        ctx = self._unpack_context(
            context,
            question=question,
            answer=answer,
            previous_turns=previous_turns,
            brand_name=brand_name,
            survey_objective=survey_objective,
            language=language,
            custom_instructions=custom_instructions,
            question_category=question_category,
            survey_type=survey_type,
            respondent_surface=respondent_surface,
        )

        if not self.api_key or not self.client:
            return _complete_response("OpenAI API key not configured.")

        if not ctx.answer or len(ctx.answer.strip()) < _MIN_ANSWER_LENGTH:
            return _complete_response("Answer is too short or blank, aborting probe.")

        messages = self._build_messages(ctx)
        model = settings.OPENAI_MODEL or "gpt-4o-mini"
        dedup_key = self._build_dedup_key(ctx)

        async def _call_api():
            response = await stream_json_completion(
                client=self.client,
                model=model,
                messages=messages,
                max_tokens=400,
                temperature=0.7,
                response_format=get_response_format("smart_followup"),
            )
            api_cost.add_from_openai_response(
                component="smart_followup",
                model=model,
                response=response,
                duration_ms=getattr(response, "duration_ms", 0),
            )
            return json.loads(response.choices[0].message.content)

        try:
            result = await AIGuard.wrap_call_async(
                slide_id="smart_followup_round",
                func=_call_api,
                dedup_key=dedup_key,
                survey_id=ctx.survey_id,
            )

            if result == AIGuard.FALLBACK_MSG:
                return _complete_response("AIGuard quota exhausted for smart follow-up.")

            return result

        except Exception as exc:
            logger.error("Smart follow-up evaluation failed: %s", exc)
            return _complete_response(f"Backend exception: {exc}")


smart_followup_engine = SmartFollowUpEngine()
