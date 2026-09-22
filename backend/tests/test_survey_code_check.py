"""
Editing a survey must not report its own code as taken.

`GET /surveys/check-code/{code}` answers "is this code free?". On an edit screen
the answer has to ignore the survey being edited, or the form tells the analyst
their own reserved code is unavailable and flags a valid project red.

The endpoint has always accepted `exclude_id`; the edit page simply never sent
it, so the query matched the survey against itself. These tests pin the query
semantics that make the fix meaningful.
"""
from __future__ import annotations

from bson import ObjectId

from backend.routers.surveys import check_survey_code


class _FakeCollection:
    """Records the query it is given and reports whether it would match."""

    def __init__(self, docs):
        self.docs = docs
        self.last_query = None

    async def find_one(self, query):
        self.last_query = query
        for doc in self.docs:
            if doc.get("survey_code") != query.get("survey_code"):
                continue
            if doc.get("is_deleted"):
                continue
            ne = (query.get("_id") or {}).get("$ne")
            if ne is not None and doc["_id"] == ne:
                continue
            return doc
        return None


class _FakeDB:
    def __init__(self, collection):
        self._collection = collection

    def get_collection(self, _name):
        return self._collection


async def _check(monkeypatch, docs, code, exclude_id):
    from backend.routers import surveys as surveys_router

    col = _FakeCollection(docs)
    monkeypatch.setattr(surveys_router, "db", _FakeDB(col))
    result = await check_survey_code(code=code, current_user=None, exclude_id=exclude_id)
    return result, col


async def test_a_surveys_own_code_is_free_to_itself(monkeypatch):
    """The exact edit-screen case: PJ-2026 belongs to the survey being edited."""
    oid = ObjectId()
    docs = [{"_id": oid, "survey_code": "PJ-2026"}]

    result, _ = await _check(monkeypatch, docs, "PJ-2026", str(oid))
    assert result == {"exists": False}


async def test_another_surveys_code_is_still_taken(monkeypatch):
    """Excluding self must not weaken the check against a real collision."""
    mine, theirs = ObjectId(), ObjectId()
    docs = [{"_id": theirs, "survey_code": "PJ-2026"}]

    result, _ = await _check(monkeypatch, docs, "PJ-2026", str(mine))
    assert result == {"exists": True}


async def test_without_exclude_id_a_survey_collides_with_itself(monkeypatch):
    """
    Documents the bug being fixed: this is exactly what the edit page did by
    omitting the id, and why it showed "SURVEY CODE ALREADY TAKEN".
    """
    oid = ObjectId()
    docs = [{"_id": oid, "survey_code": "PJ-2026"}]

    result, _ = await _check(monkeypatch, docs, "PJ-2026", None)
    assert result == {"exists": True}


async def test_deleted_surveys_do_not_reserve_a_code(monkeypatch):
    docs = [{"_id": ObjectId(), "survey_code": "PJ-2026", "is_deleted": True}]

    result, col = await _check(monkeypatch, docs, "PJ-2026", None)
    assert result == {"exists": False}
    assert col.last_query["is_deleted"] == {"$ne": True}


async def test_an_unparseable_exclude_id_does_not_error(monkeypatch):
    """
    A malformed id used to raise InvalidId and return 500, which left the form
    unable to validate at all. It now degrades to excluding nothing.
    """
    docs = [{"_id": ObjectId(), "survey_code": "PJ-2026"}]

    result, col = await _check(monkeypatch, docs, "PJ-2026", "not-an-object-id")
    assert result == {"exists": True}
    assert "_id" not in col.last_query
