import json
import logging
from typing import Any, Optional, Union
import redis.asyncio as redis
from backend.config import settings

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self._url = settings.REDIS_URL

    async def connect(self):
        if not self.redis:
            try:
                self.redis = redis.from_url(self._url, decode_responses=True)
                await self.redis.ping()
                logger.info("Successfully connected to Redis")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self.redis = None

    async def get(self, key: str) -> Optional[Any]:
        if not self.redis:
            await self.connect()
        if not self.redis:
            return None
        
        try:
            data = await self.redis.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.error(f"Error getting key {key} from cache: {e}")
            return None

    async def set(self, key: str, value: Any, ttl: int = settings.CACHE_TTL):
        if not self.redis:
            await self.connect()
        if not self.redis:
            return
            
        try:
            data = json.dumps(value)
            await self.redis.set(key, data, ex=ttl)
        except Exception as e:
            logger.error(f"Error setting key {key} in cache: {e}")

    async def delete(self, key: str):
        if not self.redis:
            await self.connect()
        if not self.redis:
            return
        await self.redis.delete(key)

    async def delete_pattern(self, pattern: str):
        if not self.redis:
            await self.connect()
        if not self.redis:
            return
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)

# Global cache instance
cache = CacheService()
