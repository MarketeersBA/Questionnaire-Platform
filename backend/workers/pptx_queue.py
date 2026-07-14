"""
Redis-backed durable queue for PPTX export jobs.
"""
from __future__ import annotations

import json
import logging
import os
import socket
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
import redis as sync_redis

from backend.config import settings

logger = logging.getLogger(__name__)

QUEUE_KEY = os.getenv("PPTX_QUEUE_KEY", "pptx:jobs")
DEDUP_SET_KEY = os.getenv("PPTX_QUEUE_DEDUP_KEY", "pptx:jobs:dedup")
LEASE_KEY_PREFIX = os.getenv("PPTX_LEASE_PREFIX", "pptx:lease:")

DEFAULT_LEASE_SECONDS = int(os.getenv("PPTX_LEASE_SECONDS", "5400"))
LEASE_RENEW_SECONDS = int(os.getenv("PPTX_LEASE_RENEW_SECONDS", "600"))


@dataclass(frozen=True)
class PptxQueueJob:
    job_id: str
    report_id: str
    survey_id: str
    attempt: int

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "PptxQueueJob":
        data = json.loads(raw)
        return cls(
            job_id=str(data["job_id"]),
            report_id=str(data["report_id"]),
            survey_id=str(data["survey_id"]),
            attempt=int(data.get("attempt") or 1),
        )


def worker_id() -> str:
    host = socket.gethostname()
    pid = os.getpid()
    return f"pptx-worker-{host}-{pid}"


class PptxJobQueue:
    """Async queue API used by FastAPI."""

    def __init__(self, redis_url: Optional[str] = None):
        self._url = redis_url or settings.REDIS_URL
        self._client: Optional[aioredis.Redis] = None

    async def connect(self) -> bool:
        if self._client:
            return True
        try:
            self._client = aioredis.from_url(self._url, decode_responses=True)
            await self._client.ping()
            return True
        except Exception as exc:
            logger.error("[PPTX-Queue] Async Redis connect failed: %s", exc)
            self._client = None
            return False

    async def enqueue(self, job: PptxQueueJob) -> bool:
        if not await self.connect():
            return False
        assert self._client is not None
        added = await self._client.sadd(DEDUP_SET_KEY, job.job_id)
        if not added:
            logger.info("[PPTX-Queue] Job %s already deduped in queue set", job.job_id)
            return True
        await self._client.rpush(QUEUE_KEY, job.to_json())
        logger.info(
            "[PPTX-Queue] Enqueued job=%s report=%s survey=%s attempt=%s",
            job.job_id,
            job.report_id,
            job.survey_id,
            job.attempt,
        )
        return True

    async def release_dedup(self, job_id: str) -> None:
        if not await self.connect() or not self._client:
            return
        await self._client.srem(DEDUP_SET_KEY, job_id)

    async def has_lease(self, job_id: str) -> bool:
        if not await self.connect() or not self._client:
            return False
        return bool(await self._client.exists(f"{LEASE_KEY_PREFIX}{job_id}"))

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None


class SyncPptxJobQueue:
    """Blocking queue consumer for the dedicated worker process."""

    def __init__(self, redis_url: Optional[str] = None):
        self._url = redis_url or settings.REDIS_URL
        self._client: Optional[sync_redis.Redis] = None

    def connect(self) -> bool:
        if self._client:
            return True
        try:
            self._client = sync_redis.from_url(self._url, decode_responses=True)
            self._client.ping()
            return True
        except Exception as exc:
            logger.error("[PPTX-Queue] Sync Redis connect failed: %s", exc)
            self._client = None
            return False

    def blocking_dequeue(self, timeout_sec: int = 5) -> Optional[PptxQueueJob]:
        if not self.connect() or not self._client:
            return None
        item = self._client.blpop(QUEUE_KEY, timeout=timeout_sec)
        if not item:
            return None
        _, payload = item
        return PptxQueueJob.from_json(payload)

    def requeue(self, job: PptxQueueJob) -> None:
        if not self.connect() or not self._client:
            return
        self._client.rpush(QUEUE_KEY, job.to_json())
        logger.info("[PPTX-Queue] Re-queued job=%s", job.job_id)

    def acquire_lease(self, job_id: str, owner: str, ttl_sec: int = DEFAULT_LEASE_SECONDS) -> bool:
        if not self.connect() or not self._client:
            return False
        key = f"{LEASE_KEY_PREFIX}{job_id}"
        acquired = self._client.set(key, owner, nx=True, ex=ttl_sec)
        if acquired:
            logger.info("[PPTX-Queue] Lease acquired job=%s owner=%s", job_id, owner)
        return bool(acquired)

    def renew_lease(self, job_id: str, owner: str, ttl_sec: int = LEASE_RENEW_SECONDS) -> bool:
        if not self.connect() or not self._client:
            return False
        key = f"{LEASE_KEY_PREFIX}{job_id}"
        current = self._client.get(key)
        if current != owner:
            return False
        return bool(self._client.expire(key, ttl_sec))

    def release_lease(self, job_id: str, owner: str) -> None:
        if not self.connect() or not self._client:
            return
        key = f"{LEASE_KEY_PREFIX}{job_id}"
        current = self._client.get(key)
        if current == owner:
            self._client.delete(key)
            logger.info("[PPTX-Queue] Lease released job=%s", job_id)

    def has_lease(self, job_id: str) -> bool:
        if not self.connect() or not self._client:
            return False
        return bool(self._client.exists(f"{LEASE_KEY_PREFIX}{job_id}"))

    def get_lease_owner(self, job_id: str) -> Optional[str]:
        if not self.connect() or not self._client:
            return None
        return self._client.get(f"{LEASE_KEY_PREFIX}{job_id}")
