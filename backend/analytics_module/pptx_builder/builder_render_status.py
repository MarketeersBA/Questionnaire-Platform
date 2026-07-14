from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ChartRenderStatus(str, Enum):
    RENDERED = "rendered"
    SKIPPED_EMPTY_DATA = "skipped_empty_data"
    FAILED = "failed"


class BuilderEmptyDataError(ValueError):
    """Raised when a chart payload cannot produce visible native content."""


@dataclass(frozen=True)
class ChartRenderResult:
    status: ChartRenderStatus
    message: str = ""

    @classmethod
    def rendered(cls, message: str = "") -> ChartRenderResult:
        return cls(ChartRenderStatus.RENDERED, message)

    @classmethod
    def skipped_empty_data(cls, message: str) -> ChartRenderResult:
        return cls(ChartRenderStatus.SKIPPED_EMPTY_DATA, message)

    @classmethod
    def failed(cls, message: str) -> ChartRenderResult:
        return cls(ChartRenderStatus.FAILED, message)
