"""Phase 4 — packaging heatmap aggregation and ingest parity."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.packaging_heatmap.constants import PACKAGING_HEATMAP_GRID_SIZE
from backend.services.packaging_heatmap_analytics_service import (
    _aggregate_rows_in_memory,
    bin_click,
    filter_packaging_heatmap_evaluations,
    ingest_response,
    rebuild_aggregates,
    resolve_heatmap_side_intent,
)
from backend.routers.public import _validate_packaging_heatmap_feedback

SURVEY_ID = "507f1f77bcf86cd799439011"
QUESTION_ID = "Acme_pkg_hm_front_attraction"


def _heatmap_row(clicks: List[Dict[str, float]], question_id: str = QUESTION_ID) -> Dict[str, Any]:
    return {
        "question_id": question_id,
        "module": "packaging_heatmap",
        "value": {
            "image_side": "front",
            "intent": "attraction",
            "ref_width": 800,
            "ref_height": 600,
            "clicks": clicks,
        },
    }


def test_bin_click_known_coordinates():
    # x=0,y=0 -> index 0
    assert bin_click(0.0, 0.0) == 0
    # x just below 1/32, y=0 -> col 0, row 0
    assert bin_click(0.01, 0.0) == 0
    # x=0.5, y=0.5 on 32 grid -> col 16, row 16 -> 16*32+16 = 528
    assert bin_click(0.5, 0.5) == 16 * PACKAGING_HEATMAP_GRID_SIZE + 16
    # clamp edge
    assert bin_click(1.0, 1.0) == PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE - 1


def test_aggregate_rows_in_memory_counts_bins():
    rows = [
        _heatmap_row([{"x": 0.1, "y": 0.1}, {"x": 0.1, "y": 0.1}]),
        _heatmap_row([{"x": 0.9, "y": 0.9}]),
    ]
    buckets = _aggregate_rows_in_memory(rows)
    assert QUESTION_ID in buckets
    bucket = buckets[QUESTION_ID]
    assert bucket["response_count"] == 2
    assert bucket["total_clicks"] == 3
    idx_near_origin = bin_click(0.1, 0.1)
    idx_far = bin_click(0.9, 0.9)
    assert bucket["bins"][idx_near_origin] == 2
    assert bucket["bins"][idx_far] == 1


def test_resolve_heatmap_side_intent_from_question_id():
    side, intent = resolve_heatmap_side_intent({
        "question_id": "Brand_pkg_hm_back_improve",
        "value": {},
    })
    assert side == "back"
    assert intent == "improve"


def test_filter_packaging_heatmap_evaluations():
    rows = [
        _heatmap_row([{"x": 0.2, "y": 0.2}]),
        {"question_id": "x", "module": "product_test", "value": 5},
    ]
    filtered = filter_packaging_heatmap_evaluations(rows)
    assert len(filtered) == 1


def test_validate_packaging_heatmap_feedback_requires_each_pin_feedback():
    answers = {
        "__structured": {
            "product_test": {
                "flat_evaluations": [
                    _heatmap_row([
                        {"x": 0.2, "y": 0.2, "feedback": {"sentiment": "like", "comment": "nice color"}},
                        {"x": 0.4, "y": 0.4},
                    ])
                ]
            }
        }
    }

    error = _validate_packaging_heatmap_feedback(answers, require_followup_attempt=False)
    assert error == f"Heatmap question {QUESTION_ID} point 2 requires text or voice feedback."


def test_validate_packaging_heatmap_feedback_requires_followup_when_enabled():
    answers = {
        "__structured": {
            "product_test": {
                "flat_evaluations": [
                    _heatmap_row([
                        {"x": 0.2, "y": 0.2, "feedback": {"sentiment": "like", "comment": "nice color"}},
                    ])
                ]
            }
        }
    }

    assert _validate_packaging_heatmap_feedback(answers, require_followup_attempt=False) is None
    assert (
        _validate_packaging_heatmap_feedback(answers, require_followup_attempt=True)
        == f"Heatmap question {QUESTION_ID} point 1 requires AI follow-up before submission."
    )

    answers["__structured"]["product_test"]["flat_evaluations"][0]["value"]["clicks"][0]["feedback"]["follow_up_requested"] = True
    assert _validate_packaging_heatmap_feedback(answers, require_followup_attempt=True) is None


class InMemoryAggCollection:
    """Minimal async collection for ingest/rebuild parity tests."""

    def __init__(self):
        self.docs: Dict[str, Dict[str, Any]] = {}

    def _key(self, survey_id: str, question_id: str) -> str:
        return f"{survey_id}::{question_id}"

    async def update_one(self, filt: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        key = self._key(filt["survey_id"], filt["question_id"])
        now = datetime.now(timezone.utc)
        doc = self.docs.get(key)
        if doc is None:
            if not upsert:
                return MagicMock(matched_count=0, modified_count=0)
            doc = deepcopy(update.get("$setOnInsert", {}))
            doc.update(filt)
            if "bins" not in doc:
                doc["bins"] = [0] * (PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE)
            doc["created_at"] = now
            self.docs[key] = doc

        for field, value in (update.get("$set") or {}).items():
            doc[field] = value

        for field, inc in (update.get("$inc") or {}).items():
            if field == "total_clicks":
                doc["total_clicks"] = doc.get("total_clicks", 0) + inc
            elif field == "response_count":
                doc["response_count"] = doc.get("response_count", 0) + inc
            elif field.startswith("bins."):
                idx = int(field.split(".", 1)[1])
                bins = doc.setdefault("bins", [0] * (PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE))
                while len(bins) <= idx:
                    bins.append(0)
                bins[idx] += inc

        doc["updated_at"] = now

    async def delete_many(self, filt: Dict[str, Any]):
        keys = [k for k, doc in self.docs.items() if doc.get("survey_id") == filt.get("survey_id")]
        for key in keys:
            del self.docs[key]
        return MagicMock(deleted_count=len(keys))

    async def insert_many(self, docs: List[Dict[str, Any]]):
        for doc in docs:
            key = self._key(doc["survey_id"], doc["question_id"])
            self.docs[key] = deepcopy(doc)

    def find(self, filt: Dict[str, Any]):
        items = [doc for doc in self.docs.values() if doc.get("survey_id") == filt.get("survey_id")]
        return _FakeCursor(items)


class _FakeCursor:
    def __init__(self, items: List[Dict[str, Any]]):
        self._items = sorted(items, key=lambda d: d.get("question_id", ""))

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _length=None):
        return list(self._items)

    def __aiter__(self):
        self._iter = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


@pytest.mark.asyncio
async def test_ingest_incremental_updates_bins():
    col = InMemoryAggCollection()
    rows = [_heatmap_row([{"x": 0.25, "y": 0.25}])]

    with patch("backend.services.packaging_heatmap_analytics_service.db") as mock_db:
        mock_db.get_collection.return_value = col
        count = await ingest_response(SURVEY_ID, rows)

    assert count == 1
    doc = col.docs[f"{SURVEY_ID}::{QUESTION_ID}"]
    idx = bin_click(0.25, 0.25)
    assert doc["bins"][idx] == 1
    assert doc["total_clicks"] == 1
    assert doc["response_count"] == 1


@pytest.mark.asyncio
async def test_ingest_and_rebuild_parity():
    col = InMemoryAggCollection()
    responses_col = MagicMock()

    response_docs = [
        {
            "token": "t1",
            "answers": {
                "__structured": {
                    "product_test": {
                        "flat_evaluations": [
                            _heatmap_row([{"x": 0.1, "y": 0.1}]),
                        ],
                    },
                },
            },
        },
        {
            "token": "t2",
            "answers": {
                "__structured": {
                    "product_test": {
                        "flat_evaluations": [
                            _heatmap_row([{"x": 0.1, "y": 0.1}, {"x": 0.8, "y": 0.8}]),
                        ],
                    },
                },
            },
        },
    ]

    async def _ingest(survey_id: str, flat_evaluations: List[Dict[str, Any]]):
        with patch("backend.services.packaging_heatmap_analytics_service.db") as mock_db:
            mock_db.get_collection.return_value = col
            return await ingest_response(survey_id, flat_evaluations)

    from backend.services.product_test_analytics_service import extract_product_test_flat_evaluations

    for doc in response_docs:
        flat = extract_product_test_flat_evaluations(doc["answers"])
        await _ingest(SURVEY_ID, flat)

    incremental = deepcopy(col.docs[f"{SURVEY_ID}::{QUESTION_ID}"])

    responses_col.find.return_value = _FakeCursor(response_docs)

    with patch("backend.services.packaging_heatmap_analytics_service.db") as mock_db:
        def get_collection(name: str):
            if name == "packaging_heatmap_aggregates":
                return col
            if name == "responses":
                return responses_col
            raise KeyError(name)

        mock_db.get_collection.side_effect = get_collection
        col.docs.clear()
        result = await rebuild_aggregates(SURVEY_ID)

    rebuilt = col.docs[f"{SURVEY_ID}::{QUESTION_ID}"]
    assert result["aggregate_count"] == 1
    assert rebuilt["response_count"] == incremental["response_count"] == 2
    assert rebuilt["total_clicks"] == incremental["total_clicks"] == 3
    assert rebuilt["bins"] == incremental["bins"]
