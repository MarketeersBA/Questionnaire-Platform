"""
Failed chart capture diagnostics — screenshots, HTML, console/network logs (Phase 5).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("pptx.capture.diagnostics")

_HTML_SNIPPET_MAX_CHARS = int(
    __import__("os").getenv("PPTX_CAPTURE_DIAG_HTML_SNIPPET_CHARS", "8000")
)
_CONSOLE_MAX = 50
_NETWORK_MAX = 30


@dataclass
class CaptureFailureDiagnostics:
    chart_id: str
    attempt: int
    failure_kind: str
    error_message: str
    bundle_dir: str
    screenshot_path: Optional[str] = None
    html_path: Optional[str] = None
    html_snippet: Optional[str] = None
    console_errors: List[str] = field(default_factory=list)
    network_errors: List[Dict[str, Any]] = field(default_factory=list)
    captured_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @property
    def manifest_path(self) -> str:
        return str(Path(self.bundle_dir) / "diagnostics.json")


class PageCaptureInstrumentation:
    """Collect console and failed network events from a Playwright page."""

    def __init__(self) -> None:
        self._console: List[str] = []
        self._network: List[Dict[str, Any]] = []
        self._attached = False

    def attach(self, page: Any) -> None:
        if self._attached or not hasattr(page, "on"):
            return

        def _on_console(msg: Any) -> None:
            try:
                text = msg.text if hasattr(msg, "text") else str(msg)
                level = getattr(msg, "type", "log")
                if level in ("error", "warning") or "error" in text.lower():
                    self._console.append(f"[{level}] {text}")
                    if len(self._console) > _CONSOLE_MAX:
                        self._console.pop(0)
            except Exception:
                pass

        def _on_request_failed(request: Any) -> None:
            try:
                entry = {
                    "url": getattr(request, "url", ""),
                    "method": getattr(request, "method", ""),
                    "failure": str(getattr(request, "failure", "") or ""),
                }
                self._network.append(entry)
                if len(self._network) > _NETWORK_MAX:
                    self._network.pop(0)
            except Exception:
                pass

        def _on_response(response: Any) -> None:
            try:
                status = getattr(response, "status", 0)
                if status >= 400:
                    self._network.append(
                        {
                            "url": getattr(response, "url", ""),
                            "status": status,
                            "status_text": getattr(response, "status_text", ""),
                        }
                    )
                    if len(self._network) > _NETWORK_MAX:
                        self._network.pop(0)
            except Exception:
                pass

        page.on("console", _on_console)
        page.on("requestfailed", _on_request_failed)
        page.on("response", _on_response)
        self._attached = True

    def drain(self) -> tuple[List[str], List[Dict[str, Any]]]:
        return list(self._console), list(self._network)

    def save_failure_bundle(
        self,
        page: Any,
        bundle_dir: Path,
        *,
        chart_id: str,
        attempt: int,
        failure_kind: str,
        error_message: str,
        viewport_url: str,
    ) -> CaptureFailureDiagnostics:
        bundle_dir.mkdir(parents=True, exist_ok=True)
        screenshot_path: Optional[str] = None
        html_path: Optional[str] = None
        html_snippet: Optional[str] = None

        if hasattr(page, "screenshot"):
            try:
                shot = bundle_dir / "screenshot.png"
                page.screenshot(path=str(shot), full_page=True)
                screenshot_path = str(shot.resolve())
            except Exception as exc:
                logger.debug("[Capture-Diagnostics] screenshot failed: %s", exc)

        if hasattr(page, "content"):
            try:
                html = page.content()
                html_path = str((bundle_dir / "page.html").resolve())
                Path(html_path).write_text(html, encoding="utf-8")
                html_snippet = _truncate_html(html)
            except Exception as exc:
                logger.debug("[Capture-Diagnostics] html capture failed: %s", exc)

        console_errors, network_errors = self.drain()
        diag = CaptureFailureDiagnostics(
            chart_id=chart_id,
            attempt=attempt,
            failure_kind=failure_kind,
            error_message=error_message,
            bundle_dir=str(bundle_dir.resolve()),
            screenshot_path=screenshot_path,
            html_path=html_path,
            html_snippet=html_snippet,
            console_errors=console_errors,
            network_errors=network_errors,
        )
        manifest = {
            **diag.as_dict(),
            "viewport_url": viewport_url,
        }
        Path(diag.manifest_path).write_text(
            json.dumps(manifest, indent=2, default=str),
            encoding="utf-8",
        )
        logger.info(
            "[Capture-Diagnostics] Saved failure bundle chart_id=%s attempt=%s dir=%s",
            chart_id,
            attempt,
            bundle_dir,
        )
        return diag


def _truncate_html(html: str) -> str:
    cleaned = re.sub(r"\s+", " ", html).strip()
    if len(cleaned) <= _HTML_SNIPPET_MAX_CHARS:
        return cleaned
    return cleaned[:_HTML_SNIPPET_MAX_CHARS] + "…[truncated]"


def failure_bundle_dir(artifact_dir: Path, chart_id: str, attempt: int) -> Path:
    safe_id = re.sub(r"[^\w\-.]+", "_", chart_id)[:120]
    return artifact_dir / "failures" / safe_id / f"attempt_{attempt}"


def write_minimal_diagnostic_bundle(
    bundle_dir: Path,
    *,
    chart_id: str,
    attempt: int,
    failure_kind: str,
    error_message: str,
    viewport_url: str,
) -> str:
    """JSON-only bundle when Playwright instrumentation is unavailable."""
    bundle_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = bundle_dir / "diagnostics.json"
    payload = {
        "chart_id": chart_id,
        "attempt": attempt,
        "failure_kind": failure_kind,
        "error_message": error_message,
        "viewport_url": viewport_url,
        "bundle_dir": str(bundle_dir.resolve()),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "minimal": True,
    }
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(manifest_path.resolve())
