"""
The survey list projection must only drop optional fields.

`GET /surveys/` declares `response_model=List[Survey]`. Excluding a field that
model marks required makes FastAPI fail response validation, so the endpoint
returns 500 and every page that reads it renders as zeroes — total surveys,
active surveys, responses, the whole dashboard. That happened, from excluding
`template_snapshot_schema` while trimming a 3 MB payload.

The projection is a performance measure and will be tuned again. This test is
what makes tuning it safe.
"""
from __future__ import annotations

import pytest

from backend.models import Survey, SurveyListItem
from backend.routers.surveys import LIST_PROJECTION


def test_list_model_requires_nothing_so_any_field_may_be_projected():
    """
    The list responds with `SurveyListItem`, not `Survey`.

    Against `Survey` this was a live outage: excluding `template_snapshot_schema`
    (required there) made every response fail validation, the endpoint returned
    500, and the dashboard rendered as zeroes. A model with no required field
    cannot fail that way, which is what lets the payload be trimmed freely.
    """
    required = [n for n, f in SurveyListItem.model_fields.items() if f.is_required()]
    assert required == [], f"SurveyListItem must not require fields, got {required}"


def test_projected_document_survives_the_list_model():
    projected = {"_id": "abc123", "company_name": "Test", "status": "draft"}
    item = SurveyListItem.model_validate(projected)
    dumped = item.model_dump(mode="json", by_alias=True)
    # `_id` is what every list view keys rows on.
    assert dumped["_id"] == "abc123"


def test_unlisted_fields_are_preserved_not_dropped():
    """
    `extra="allow"` is the safety net: the declared fields are the ones known to
    be read, and anything else the projection permits still reaches the client.
    Without it, trimming the payload could quietly remove a field a page needs.
    """
    item = SurveyListItem.model_validate(
        {"_id": "x", "customizations": {"brands": ["A"]}, "taste_test_config": {"ratingScale": 5}}
    )
    dumped = item.model_dump(mode="json", by_alias=True)
    assert dumped["customizations"]["brands"] == ["A"]
    assert dumped["taste_test_config"]["ratingScale"] == 5


def test_the_heavy_snapshots_are_excluded():
    """The whole point: these are most of the payload and no list view reads them."""
    for field in ("template_snapshot_schema", "template_snapshot_questions"):
        assert LIST_PROJECTION.get(field) == 0, f"{field} should be projected away"


@pytest.mark.parametrize("name", sorted(LIST_PROJECTION))
def test_every_excluded_field_is_a_real_survey_field(name):
    """A typo would silently exclude nothing and quietly undo the speedup."""
    assert name in Survey.model_fields


def test_projection_is_an_exclusion_not_a_whitelist():
    """
    Mongo rejects mixing inclusion and exclusion in one projection (except
    `_id`), and a stray 1 here would flip the meaning to "return only this".
    """
    assert set(LIST_PROJECTION.values()) == {0}
