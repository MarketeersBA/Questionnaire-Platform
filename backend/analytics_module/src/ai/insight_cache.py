import asyncio
import json
import logging
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
from backend.models import AIInsightCacheEntry
from backend.analytics_module.src.ai.prompt_registry import DEFAULT_PREFIX_VERSION

logger = logging.getLogger(__name__)

class InsightCacheManager:
    """
    Advanced Cache Orchestrator for AI Insights.
    Implements a 'Semantic Memory' pattern where insights are retrieved by context hashes.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["ai_insight_cache"]
        # Fire-and-forget TTL ensure
        asyncio.create_task(self.ensure_ttl_index())

    async def ensure_ttl_index(self):
        """Ensures MongoDB auto-expires entries after 7 days to keep storage lean."""
        try:
            await self.collection.create_index("created_at", expireAfterSeconds=604800)
        except Exception as e:
            logger.error(f"Failed to create TTL index: {e}")

    @staticmethod
    def generate_prompt_hash(prompt_text: str) -> str:
        """Generates a stable SHA-256 hash for prompt text to detect content changes."""
        return hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()

    async def get_cached(self, 
                       survey_id: str, 
                       component_type: str, 
                       component_key: str, 
                       prompt_version: str,
                       prefix_version: str = DEFAULT_PREFIX_VERSION,
                       current_prompt_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieves a valid cache entry based on survey context and version.
        If current_prompt_text is provided, it validates the hash to ensure the prompt logic is identical.
        """
        query = {
            "survey_id": survey_id,
            "component_type": component_type,
            "component_key": component_key,
            "prompt_version": prompt_version,
            "prefix_version": prefix_version
        }

        try:
            doc = await self.collection.find_one(query)
            if not doc:
                return None

            # 1. Content Integrity Check: If prompt logic changed even if version didn't, invalidate.
            if current_prompt_text:
                current_hash = self.generate_prompt_hash(current_prompt_text)
                if doc.get("prompt_hash") != current_hash:
                    logger.info(f"Cache miss (hash mismatch) for {component_key} in survey {survey_id}")
                    return None

            # 2. Update Access Telemetry (Fire and forget)
            self.collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"last_accessed_at": datetime.now(timezone.utc)}}
            )

            # 3. Return payload structure expected by the engines
            return {
                "ai_headline": doc.get("ai_headline", ""),
                "ai_deep_analysis": doc.get("ai_deep_analysis", []),
                "is_cached": True,
                "created_at": doc.get("created_at")
            }
        except Exception as e:
            logger.error(f"Cache retrieval error for {component_key}: {e}")
            return None

    async def get_or_execute(self,
                             survey_id: str,
                             component_type: str,
                             component_key: str,
                             prompt_version: str,
                             messages: List[Dict[str, str]],
                             executor_coro) -> Any:
        """
        High-level orchestrator:
        1. Check Application-Side Cache (0ms latency proxy)
        2. If miss, run Executor (Network + API Cost)
        3. Persist to Cache in background
        """
        # Generate hash of entire message list for total content integrity
        current_prompt_text = json.dumps(messages, sort_keys=True)
        
        cached = await self.get_cached(
            survey_id, component_type, component_key, 
            prompt_version, current_prompt_text=current_prompt_text
        )
        
        if cached:
            logger.info(f"[Cache Hit] Returning response for {component_key}")
            return cached["ai_headline"] # For generic calls, we return content

        # EXECUTE (Actual AI Generation)
        result_txt = await executor_coro()
        
        # PERSIST (Background)
        from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
        prefix_v = PromptOrchestrator.get_prefix_version()

        await self.set_cache(
            survey_id=survey_id,
            component_type=component_type,
            component_key=component_key,
            prompt_version=prompt_version,
            prefix_version=prefix_v,
            prompt_text=current_prompt_text,
            headline=result_txt,
            analysis=[],
            raw_response=result_txt,
            model="orchestrated",
            token_metrics={},
            cost_usd=0
        )
        
        return result_txt

    async def set_cache(self, 
                       survey_id: str, 
                       component_type: str, 
                       component_key: str,
                       prompt_version: str, 
                       prefix_version: str,
                       prompt_text: str,
                       headline: str, 
                       analysis: List[Dict[str, Any]], 
                       raw_response: str,
                       model: str, 
                       token_metrics: Dict[str, Any],
                       cost_usd: float) -> bool:
        """
        Persists an AI response to the cache with strict model validation.
        Uses upsert to handle updates to existing entries.
        """
        try:
            prompt_hash = self.generate_prompt_hash(prompt_text)
            
            # Construct entry using the validated Pydantic model
            entry = AIInsightCacheEntry(
                survey_id=survey_id,
                component_type=component_type,
                component_key=component_key,
                prompt_version=prompt_version,
                prefix_version=prefix_version,
                prompt_hash=prompt_hash,
                ai_headline=headline,
                ai_deep_analysis=analysis,
                raw_response=raw_response,
                model_used=model,
                prompt_tokens=token_metrics.get("prompt_tokens", 0),
                completion_tokens=token_metrics.get("completion_tokens", 0),
                cost_usd=cost_usd,
                created_at=datetime.now(timezone.utc),
                last_accessed_at=datetime.now(timezone.utc)
            )

            # Perform atomic upsert
            result = await self.collection.update_one(
                {
                    "survey_id": survey_id,
                    "component_type": component_type,
                    "component_key": component_key,
                    "prompt_version": prompt_version,
                    "prefix_version": prefix_version
                },
                {"$set": entry.model_dump(exclude={"id"})},
                upsert=True
            )
            
            return result.acknowledged
        except Exception as e:
            logger.error(f"Failed to set cache for {component_key}: {e}")
            return False

    async def invalidate_survey(self, survey_id: str) -> int:
        """Wipes all cached insights for a specific survey. Used on 'Force Regenerate'."""
        try:
            result = await self.collection.delete_many({"survey_id": survey_id})
            logger.info(f"Invalidated {result.deleted_count} cache entries for survey {survey_id}")
            return result.deleted_count
        except Exception as e:
            logger.error(f"Failed to invalidate cache for survey {survey_id}: {e}")
            return 0

    async def get_survey_cache_stats(self, survey_id: str) -> Dict[str, Any]:
        """
        Generates telemetry stats for a survey's AI usage and cache efficiency.
        Crucial for the Partner Administrator Dashboard.
        """
        try:
            pipeline = [
                {"$match": {"survey_id": survey_id}},
                {
                    "$group": {
                        "_id": "$survey_id",
                        "total_cached_items": {"$sum": 1},
                        "total_tokens": {"$sum": {"$add": ["$prompt_tokens", "$completion_tokens"]}},
                        "total_cost_saved_usd": {"$sum": "$cost_usd"},
                        "uniques_versions": {"$addToSet": "$prompt_version"},
                        "oldest_entry": {"$min": "$created_at"},
                        "newest_entry": {"$max": "$created_at"}
                    }
                }
            ]
            
            stats = await self.collection.aggregate(pipeline).to_list(1)
            if not stats:
                return {"has_cache": False, "total_cached_items": 0}
            
            res = stats[0]
            res["has_cache"] = True
            return res
        except Exception as e:
            logger.error(f"Failed to aggregate cache stats for survey {survey_id}: {e}")
            return {"error": str(e)}
