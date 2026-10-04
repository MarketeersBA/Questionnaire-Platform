"""
A survey closes itself once its respondent quota is filled.

The master link mints a token for anyone who opens it while the survey is
`active`, and nothing used to change that status. So after the last qualifying
respondent the link kept letting people in, ran each of them through the whole
screener, and only then told them the study was full — and the creator had to
remember to close it by hand. Closing on the reservation that fills the quota
makes the link itself report it, through the status check the master-link
endpoint already performs.
"""
from __future__ import annotations

import pytest

from backend.services.quota_enforcement import (
    close_survey_if_target_reached,
    compute_target_reached,
)

SURVEY_ID = "6ab11e7b55b109d4c23ccb2d"


class _FakeSurveysCollection:
    """Minimal stand-in that honours the filter fields this call relies on."""

    def __init__(self, doc):
        self.doc = doc
        self.updates = []

    async def update_one(self, flt, update):
        self.updates.append((flt, update))

        if "status" in flt and self.doc.get("status") != flt["status"]:
            return _Result(0)
        count_filter = flt.get("respondent_count") or {}
        if "$gte" in count_filter and self.doc.get("respondent_count", 0) < count_filter["$gte"]:
            return _Result(0)

        self.doc.update(update.get("$set") or {})
        return _Result(1)


class _Result:
    def __init__(self, modified_count):
        self.modified_count = modified_count


def _survey(**overrides):
    base = {"status": "active", "respondent_count": 0}
    base.update(overrides)
    return base


# ── compute_target_reached ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "target,current,expected",
    [
        (10, 10, True),
        (10, 11, True),
        (10, 9, False),
        (0, 5, False),   # no target set — there is no finish line to cross
        (0, 0, False),
    ],
)
def test_compute_target_reached(target, current, expected):
    assert compute_target_reached(target, current) is expected


# ── close_survey_if_target_reached ────────────────────────────────────────


@pytest.mark.asyncio
async def test_closes_an_active_survey_once_the_quota_is_full():
    col = _FakeSurveysCollection(_survey(respondent_count=50))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=50)

    assert closed is True
    assert col.doc["status"] == "closed"
    assert col.doc["closed_reason"] == "quota_reached"
    assert col.doc.get("closed_at") is not None


@pytest.mark.asyncio
async def test_leaves_the_survey_open_while_slots_remain():
    col = _FakeSurveysCollection(_survey(respondent_count=49))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=50)

    assert closed is False
    assert col.doc["status"] == "active"


@pytest.mark.asyncio
async def test_an_unset_quota_never_closes_the_survey():
    """A target of 0 means "no cap" — such a survey only ever closes by hand."""
    col = _FakeSurveysCollection(_survey(respondent_count=9999))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=0)

    assert closed is False
    assert col.doc["status"] == "active"
    assert col.updates == [], "must not even attempt a write when there is no cap"


@pytest.mark.asyncio
async def test_a_draft_is_left_alone():
    """Drafts are how a creator tests their own survey; filling a quota there
    must not take the study live-then-closed behind their back."""
    col = _FakeSurveysCollection(_survey(status="draft", respondent_count=50))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=50)

    assert closed is False
    assert col.doc["status"] == "draft"


@pytest.mark.asyncio
async def test_closes_a_survey_that_was_already_over_quota():
    """
    Surveys that filled up before auto-closing existed sit `active` at or past
    their target forever: a reservation there *fails*, so closing only on a
    successful one never reaches them and every later visitor is still made to
    sit through the screener. Found on live data — one survey was active at
    400/400. The failure path closes it too.
    """
    col = _FakeSurveysCollection(_survey(respondent_count=400))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=400)

    assert closed is True
    assert col.doc["status"] == "closed"


@pytest.mark.asyncio
async def test_a_bucket_quota_refusal_does_not_close_a_survey_with_slots_left():
    """The failure path runs this unconditionally, so a per-cell quota filling
    up (say, "men 18-25") must not close a study that still needs people."""
    col = _FakeSurveysCollection(_survey(respondent_count=12))
    closed = await close_survey_if_target_reached(col, SURVEY_ID, global_target=200)

    assert closed is False
    assert col.doc["status"] == "active"


@pytest.mark.asyncio
async def test_is_idempotent_under_concurrent_submissions():
    """Two respondents can fill the last slots at once; only the first call
    reports the close, so the log line is written once."""
    col = _FakeSurveysCollection(_survey(respondent_count=50))

    first = await close_survey_if_target_reached(col, SURVEY_ID, global_target=50)
    second = await close_survey_if_target_reached(col, SURVEY_ID, global_target=50)

    assert (first, second) == (True, False)
    assert col.doc["status"] == "closed"
