"""
Dedicated logger for recommendation LLM calls.

``generate_recommendations(..., trace_log_path=...)`` writes prompts to that file.

Manual setup (optional):

    attach_recommendation_trace_handler(Path("recommendations_trace.log"))
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Sequence, Union

LOGGER_NAME = "src.ai.recommendations"


def get_recommendation_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)


def _handler_targets_path(handler: logging.Handler, path: Path) -> bool:
    if not isinstance(handler, logging.FileHandler):
        return False
    try:
        return Path(handler.baseFilename).resolve() == path.resolve()
    except OSError:
        return False


def attach_recommendation_trace_handler(path: Union[Path, str]) -> None:
    """
    Append a UTF-8 file handler for ``MyModules.recommendations`` if not already present.
    Ensures INFO-level prompt traces are written when ``trace_recommendation_prompt`` runs.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    log = get_recommendation_logger()
    if any(_handler_targets_path(h, path) for h in log.handlers):
        return
    fh = logging.FileHandler(path, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh)
    if not log.isEnabledFor(logging.INFO):
        log.setLevel(logging.INFO)


def trace_recommendation_prompt(
    *,
    model: str,
    messages: Sequence[dict[str, Any]],
) -> None:
    """
    Log the exact messages sent to the chat completions API for recommendations.

    Uses INFO so a handler on ``MyModules.recommendations`` can capture traces
    without enabling debug for the whole app.
    """
    log = get_recommendation_logger()
    if not log.isEnabledFor(logging.INFO):
        return
    lines = [
        "======== Recommendation LLM request ========",
        f"model: {model}",
    ]
    for i, msg in enumerate(messages):
        role = (msg.get("role") or "?").strip()
        content = msg.get("content")
        text = content if isinstance(content, str) else repr(content)
        lines.append(f"--- message[{i}] role={role} ---")
        lines.append(text)
    lines.append("======== End recommendation prompt ========")
    log.info("\n".join(lines))
