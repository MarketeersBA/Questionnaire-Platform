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

from backend.models import Survey
from backend.routers.surveys import LIST_PROJECTION


def test_projection_only_excludes_optional_fields():
    required = [
        name
        for name in LIST_PROJECTION
        if Survey.model_fields[name].is_required()
    ]
    assert required == [], (
        "These fields are required by the Survey response model, so excluding "
        f"them makes GET /surveys/ return 500: {required}"
    )


@pytest.mark.parametrize("name", sorted(LIST_PROJECTION))
def test_every_excluded_field_exists_on_the_model(name):
    """A typo would silently exclude nothing and quietly undo the speedup."""
    assert name in Survey.model_fields


def test_projection_is_an_exclusion_not_a_whitelist():
    """
    Mongo rejects mixing inclusion and exclusion in one projection (except
    `_id`), and a stray 1 here would flip the meaning to "return only this".
    """
    assert set(LIST_PROJECTION.values()) == {0}


def test_a_survey_missing_only_projected_fields_still_validates():
    """
    The end-to-end guarantee: a document with every projected field stripped
    still satisfies the response model.

    The fixture is derived from the model's own required fields rather than
    hand-listed, so adding a required field to `Survey` cannot leave this test
    passing against a stale shape.
    """
    placeholders = {
        "str": "x",
        "int": 1,
        "float": 1.0,
        "bool": True,
        "dict": {},
        "list": [],
    }

    def sample_for(field):
        annotation = field.annotation
        name = getattr(annotation, "__name__", None) or str(annotation)
        origin = getattr(annotation, "__origin__", None)
        if origin is not None:
            name = getattr(origin, "__name__", name)
        if name in placeholders:
            return placeholders[name]
        # A nested model: build it from its own required fields.
        if hasattr(annotation, "model_fields"):
            return {
                n: sample_for(f)
                for n, f in annotation.model_fields.items()
                if f.is_required()
            }
        return "x"

    full = {
        name: sample_for(field)
        for name, field in Survey.model_fields.items()
        if field.is_required()
    }
    assert full, "Survey has no required fields; this test would prove nothing"

    projected = {k: v for k, v in full.items() if k not in LIST_PROJECTION}

    # Raises ValidationError if a required field was projected away — exactly
    # the 500 this guards against.
    Survey.model_validate(projected)
