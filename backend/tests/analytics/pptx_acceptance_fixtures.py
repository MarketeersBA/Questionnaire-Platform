from __future__ import annotations

from pathlib import Path

import pytest
from pptx import Presentation

from backend.analytics_module.pptx_builder.layout import PPTXLayout

TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "analytics"
    / "marketeers_template.pptx"
)


@pytest.fixture(scope="session")
def marketeers_template_path() -> Path:
    if not TEMPLATE_PATH.is_file():
        pytest.skip(f"Marketeers template not found at {TEMPLATE_PATH}")
    return TEMPLATE_PATH


@pytest.fixture(scope="session")
def marketeers_presentation(marketeers_template_path: Path) -> Presentation:
    return Presentation(str(marketeers_template_path))


@pytest.fixture(scope="session")
def marketeers_layout(marketeers_presentation: Presentation) -> PPTXLayout:
    return PPTXLayout.from_presentation(marketeers_presentation)
