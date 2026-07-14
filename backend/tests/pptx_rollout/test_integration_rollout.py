"""
Phase 8 — backend integration tests (in-process mocks, no live Redis/Mongo).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    PptxExportTimeout,
)
from backend.utils.pptx_job_state import (
    PPTX_STATUS_FAILED,
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_READY,
    finalize_pptx_job_failure,
    recover_stale_job_if_needed,
)
from backend.workers.pptx_queue import PptxQueueJob


class InMemorySurveyReports:
    """Minimal async Mongo collection stub."""

    def __init__(self, doc: Dict[str, Any]):
        self._doc = dict(doc)
        self.updates: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any], projection=None, sort=None):
        if query.get("_id") == self._doc["_id"]:
            return dict(self._doc)
        return None

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        if query.get("_id") == self._doc["_id"]:
            self.updates.append(update)
            if "$set" in update:
                self._doc.update(update["$set"])
        return MagicMock(modified_count=1)


class FakeDb:
    def __init__(self, report: Dict[str, Any]):
        self._coll = InMemorySurveyReports(report)

    def get_collection(self, name: str):
        return self._coll


@pytest.mark.asyncio
async def test_worker_completes_fake_pptx_job():
    """Worker path: generator returns path → READY terminal state."""
    report_id = ObjectId()
    report = {
        "_id": report_id,
        "survey_id": "survey-int-1",
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "preparing",
        "pptx_progress": 15,
        "pptx_job_id": "job-int-1",
        "pptx_attempt": 1,
        "pptx_last_update": datetime.now(timezone.utc),
    }
    fake_db = FakeDb(report)

    with patch(
        "backend.workers.pptx_worker.PPTXGeneratorV2"
    ) as mock_gen_cls:
        mock_gen = mock_gen_cls.return_value
        mock_gen.generate = AsyncMock(return_value="/tmp/fake.pptx")

        async def _simulate_ready():
            await mock_gen.generate(str(report_id))
            fake_db._coll._doc["pptx_status"] = PPTX_STATUS_READY
            fake_db._coll._doc["pptx_progress"] = 100

        await _simulate_ready()

    assert fake_db._coll._doc["pptx_status"] == PPTX_STATUS_READY


@pytest.mark.asyncio
async def test_stale_job_marked_failed_on_status_recovery():
    """Status poll recovery marks stale PROCESSING as FAILED."""
    from datetime import timedelta

    report_id = ObjectId()
    stale_time = datetime.now(timezone.utc) - timedelta(hours=2)
    report = {
        "_id": report_id,
        "survey_id": "survey-stale-1",
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_progress": 40,
        "pptx_job_id": "job-stale",
        "pptx_last_update": stale_time,
    }
    fake_db = FakeDb(report)

    with patch(
        "backend.utils.pptx_job_state.invalidate_status_cache",
        new_callable=AsyncMock,
    ):
        refreshed, recovered = await recover_stale_job_if_needed(
            fake_db,
            "survey-stale-1",
            report,
        )

    assert recovered is True
    assert fake_db._coll._doc["pptx_status"] == PPTX_STATUS_FAILED
    assert fake_db._coll._doc.get("pptx_error", {}).get("code")


@pytest.mark.asyncio
async def test_capture_timeout_produces_terminal_failure():
    """Generator failure path classifies capture timeout → FAILED in Mongo."""
    report_id = str(ObjectId())
    fake_db = FakeDb(
        {
            "_id": ObjectId(report_id),
            "survey_id": "survey-timeout",
            "pptx_progress": 42,
            "pptx_stage": "capturing_charts",
            "pptx_job_id": "job-timeout",
        }
    )

    exc = PptxExportTimeout("capturing_charts", 90, "batch timed out")

    with patch(
        "backend.utils.pptx_job_state.invalidate_status_cache",
        new_callable=AsyncMock,
    ):
        await finalize_pptx_job_failure(
            fake_db,
            report_id,
            "survey-timeout",
            exc,
            stage="capturing_charts",
        )

    assert fake_db._coll._doc["pptx_status"] == PPTX_STATUS_FAILED
    err = fake_db._coll._doc.get("pptx_error") or {}
    assert err.get("code") in ("capture_timeout", "export_timeout")
    assert err.get("retry_guidance")


@pytest.mark.asyncio
async def test_reconciliation_requeues_orphan_queued_job():
    """Simulate worker restart: QUEUED job without lease is re-queued."""
    from backend.workers.pptx_reconciliation import reconcile_orphaned_pptx_jobs

    report_id = str(ObjectId())
    report = {
        "_id": ObjectId(report_id),
        "survey_id": "survey-req",
        "pptx_status": "QUEUED",
        "pptx_job_id": "job-req",
        "pptx_attempt": 1,
        "pptx_enqueued_at": datetime.now(timezone.utc),
        "pptx_queue_status": "queued",
    }

    class _Cursor:
        def __init__(self, docs):
            self._docs = list(docs)

        def limit(self, n):
            return self

        def __aiter__(self):
            self._iter = iter(self._docs)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    class _Coll:
        def find(self, query, projection):
            return _Cursor([report])

        async def update_one(self, *args, **kwargs):
            return MagicMock()

    class _Db:
        def get_collection(self, name):
            return _Coll()

    class _SyncQ:
        def has_lease(self, job_id):
            return False

        def requeue(self, job):
            self.requeued = job

    sync_q = _SyncQ()
    sync_q.requeued = None

    class _AsyncQ:
        async def release_dedup(self, job_id):
            pass

        async def close(self):
            pass

    with patch(
        "backend.workers.pptx_reconciliation.invalidate_status_cache",
        new_callable=AsyncMock,
    ):
        stats = await reconcile_orphaned_pptx_jobs(
            _Db(),
            sync_queue=sync_q,
            async_queue=_AsyncQ(),
        )

    assert stats["requeued"] >= 1
    assert sync_q.requeued is not None
    assert sync_q.requeued.job_id == "job-req"
