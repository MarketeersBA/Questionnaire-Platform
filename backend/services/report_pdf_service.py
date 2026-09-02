"""
PDF export of a report, printed from the live report page.

PPTX is built slide by slide from the analytics payload. PDF takes the opposite
route: it prints the page the client is already looking at. That is deliberate —
what makes a PDF worth having here is that it carries the *same* layout, the
same AI insights next to the same charts, with the chart text still selectable
rather than flattened into a screenshot. A parser downstream can pull numbers
and recommendations straight out of it, which a picture of a chart cannot give.

The mechanics reuse the PPTX capture stack: headless Chromium, a short-lived
capture token injected into localStorage so the protected report route loads,
and the same navigation timeouts. The difference is the final call — ``page.pdf``
instead of an element screenshot.

Every failure here is a slow one by nature — a browser that will not start, a
frontend the server cannot reach, a report that never finishes rendering — and a
slow failure with a vague message is indistinguishable from a hang. So each
stage is checked up front where possible, bounded where not, and reported with
the specific thing that went wrong and what to do about it.
"""
from __future__ import annotations

import logging
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    create_capture_access_token,
)

logger = logging.getLogger(__name__)

#: Attribute the report page sets once every chart has rendered. Without it the
#: printer races the charts and produces a deck of empty axes.
READY_SELECTOR = '[data-report-ready="true"]'

#: Set by the report page when it cannot render — a failed report, a missing
#: one, an expired link. Watching for it turns a full-length timeout into an
#: immediate, explainable failure.
ERROR_SELECTOR = "[data-report-error]"

# Bounded so a stuck stage surfaces well inside the caller's own timeout rather
# than looking like the request has hung.
DEFAULT_NAV_TIMEOUT_MS = 45_000
DEFAULT_READY_TIMEOUT_MS = 60_000
DEFAULT_TOTAL_BUDGET_S = 150

#: A4 landscape. Report charts are wide; portrait squeezes them to unreadable.
PDF_FORMAT = "A4"
PDF_LANDSCAPE = True
PDF_MARGIN = {"top": "12mm", "bottom": "14mm", "left": "10mm", "right": "10mm"}


class PdfExportError(Exception):
    """
    Raised when the report could not be printed.

    ``remedy`` carries the concrete next step when there is one, so the API can
    tell an operator "install the browser" instead of "export failed".
    """

    def __init__(self, message: str, *, remedy: Optional[str] = None):
        super().__init__(message)
        self.remedy = remedy


@dataclass(frozen=True)
class PdfExportConfig:
    frontend_base_url: str
    navigation_timeout_ms: int = DEFAULT_NAV_TIMEOUT_MS
    ready_timeout_ms: int = DEFAULT_READY_TIMEOUT_MS
    total_budget_s: int = DEFAULT_TOTAL_BUDGET_S
    viewport_width: int = 1600
    viewport_height: int = 1200

    @classmethod
    def from_env(cls, *, origin_hint: Optional[str] = None) -> "PdfExportConfig":
        """
        Resolve where *this server* can reach the report page.

        This is a server-to-server address and must not be confused with the
        public one the browser uses. They are different things and conflating
        them is what made every export take a minute: in a container stack
        ``PPTX_EXPORT_FRONTEND_BASE_URL`` is the public site, so a locally-run
        export sent Chromium to production carrying a token signed with the
        local secret. Production refused it, the report never rendered, and the
        job sat until its timeout — every time.

        ``REPORT_RENDER_BASE_URL`` is therefore checked first and is the one to
        set in Docker (``http://frontend:5173``). The public URL is still
        honoured after it, so an existing single-host deployment keeps working
        untouched.
        """
        base = (
            (os.getenv("REPORT_RENDER_BASE_URL") or "").strip()
            or (os.getenv("PPTX_EXPORT_FRONTEND_BASE_URL") or "").strip()
            or (os.getenv("PUBLIC_APP_URL") or "").strip()
            or (origin_hint or "").strip()
            or "http://localhost:5173"
        )
        return cls(frontend_base_url=base.rstrip("/"))


#: Cached preflight verdict. Whether a browser binary exists is a property of
#: the deployment, not of a request, so it is resolved once per process. Doing
#: it per export cost roughly a second of driver startup every time.
_PREFLIGHT_OK: Optional[bool] = None
_PREFLIGHT_ERROR: Optional["PdfExportError"] = None


def preflight(*, force: bool = False) -> None:
    """
    Fail fast, and specifically, when PDF export cannot possibly work.

    Playwright ships as a Python package but the browser binary is a separate
    download, so a perfectly installed dependency tree can still be unable to
    launch anything. Left unchecked that surfaces as a long, opaque stall; here
    it is an immediate message naming the command that fixes it.

    The verdict is memoised. Pass ``force=True`` after installing a browser into
    a long-running process, which is the only case where it can change.
    """
    global _PREFLIGHT_OK, _PREFLIGHT_ERROR

    if not force and _PREFLIGHT_OK is not None:
        if _PREFLIGHT_ERROR:
            raise _PREFLIGHT_ERROR
        return

    def fail(error: "PdfExportError") -> None:
        global _PREFLIGHT_OK, _PREFLIGHT_ERROR
        _PREFLIGHT_OK, _PREFLIGHT_ERROR = False, error
        raise error

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        fail(
            PdfExportError(
                "Playwright is not installed, so PDF export is unavailable.",
                remedy="pip install playwright && python -m playwright install chromium",
            )
        )
        raise exc  # unreachable; keeps type checkers honest

    try:
        with sync_playwright() as playwright:
            executable = playwright.chromium.executable_path
    except Exception as exc:  # noqa: BLE001 - any driver fault is fatal here
        fail(
            PdfExportError(
                f"Could not start the Playwright driver: {exc}",
                remedy="python -m playwright install chromium",
            )
        )
        raise exc  # unreachable

    if not executable or not os.path.exists(executable):
        fail(
            PdfExportError(
                "Playwright's Chromium browser is not installed on the server, "
                "so the report cannot be printed to PDF.",
                remedy="python -m playwright install chromium",
            )
        )

    _PREFLIGHT_OK, _PREFLIGHT_ERROR = True, None


def build_print_url(survey_id: str, config: PdfExportConfig) -> str:
    """
    The report page in print mode.

    ``print=1`` tells the page to drop its app chrome — the fixed rail, the
    sticky toolbar, the export button itself — none of which mean anything on
    paper, and all of which would otherwise repeat on every page. It also stops
    the page kicking off a report *generation* when none exists, which would
    leave the printer waiting on work it just caused.
    """
    return f"{config.frontend_base_url}/surveys/{survey_id}/report?print=1"


def render_report_pdf(
    survey_id: str,
    *,
    output_path: Optional[Path] = None,
    config: Optional[PdfExportConfig] = None,
    origin_hint: Optional[str] = None,
    watermark: Optional[str] = None,
) -> Path:
    """
    Print a survey's report to PDF and return the file path.

    Synchronous and blocking — Playwright's sync API. Callers in the FastAPI
    request path must run this in a threadpool.
    """
    preflight()

    cfg = config or PdfExportConfig.from_env(origin_hint=origin_hint)
    started = time.monotonic()

    target = Path(output_path) if output_path else Path(
        tempfile.gettempdir()
    ) / f"report_{survey_id}.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    # Scoped to this survey and short-lived, so the printer can load a protected
    # route without a human's credentials ever being involved.
    token = create_capture_access_token(survey_id=survey_id)
    url = build_print_url(survey_id, cfg)

    logger.info("[PDF] Printing report for survey %s from %s", survey_id, url)

    def remaining_ms(cap: int) -> int:
        """Never let one stage spend budget a later stage still needs."""
        left = int((cfg.total_budget_s - (time.monotonic() - started)) * 1000)
        if left <= 1000:
            raise PdfExportError(
                "PDF export ran out of time before the report finished rendering."
            )
        return min(cap, left)

    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(headless=True)
        except PlaywrightError as exc:
            raise PdfExportError(
                f"Could not launch the browser for PDF export: {exc}",
                remedy="python -m playwright install chromium",
            ) from exc

        try:
            context = browser.new_context(
                viewport={"width": cfg.viewport_width, "height": cfg.viewport_height},
                ignore_https_errors=True,
            )
            # Mirrors the PPTX capture stack: the frontend reads its bearer token
            # from localStorage, so it has to be there before the app boots.
            context.add_init_script(
                "window.localStorage.setItem('token', %r);" % token
            )
            page = context.new_page()
            page.on(
                "console",
                lambda msg: logger.debug("[PDF][page] %s: %s", msg.type, msg.text),
            )

            try:
                page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=remaining_ms(cfg.navigation_timeout_ms),
                )
            except PlaywrightTimeout as exc:
                raise PdfExportError(
                    f"The server could not load the report page at {url}.",
                    remedy=(
                        "Check that the frontend is running and reachable from the "
                        "API server, and that PPTX_EXPORT_FRONTEND_BASE_URL points at it."
                    ),
                ) from exc

            # Race readiness against the page's own error surface, so a report
            # that cannot render fails in a second instead of at the timeout.
            try:
                page.wait_for_selector(
                    f"{READY_SELECTOR}, {ERROR_SELECTOR}",
                    timeout=remaining_ms(cfg.ready_timeout_ms),
                )
            except PlaywrightTimeout as exc:
                raise PdfExportError(
                    "The report did not finish rendering in time to be printed.",
                    remedy="Open the report in a browser to confirm it loads, then retry.",
                ) from exc

            if page.query_selector(ERROR_SELECTOR):
                detail = (page.text_content(ERROR_SELECTOR) or "").strip()
                raise PdfExportError(
                    f"The report could not be displayed: {detail or 'unknown error'}"
                )

            # Recharts animates on mount. Printing mid-animation captures bars
            # partway up, so settle before the snapshot.
            page.wait_for_timeout(1200)

            # Chromium honours print media for @page rules, but screen media is
            # what the report is designed in — emulate screen so the report keeps
            # its own colours rather than falling back to print defaults.
            page.emulate_media(media="screen")

            if watermark:
                page.evaluate(_WATERMARK_SCRIPT, watermark)

            page.pdf(
                path=str(target),
                format=PDF_FORMAT,
                landscape=PDF_LANDSCAPE,
                print_background=True,
                margin=PDF_MARGIN,
                prefer_css_page_size=False,
            )
        finally:
            browser.close()

    if not target.exists() or target.stat().st_size == 0:
        raise PdfExportError("The PDF file came out empty.")

    logger.info(
        "[PDF] Wrote %s (%d bytes) in %.1fs",
        target,
        target.stat().st_size,
        time.monotonic() - started,
    )
    return target


#: Injected rather than baked into the app so an ordinary on-screen viewing of
#: the report never shows it.
_WATERMARK_SCRIPT = """
(label) => {
  const el = document.createElement('div');
  el.textContent = label;
  Object.assign(el.style, {
    position: 'fixed', bottom: '6px', right: '10px', zIndex: '2147483647',
    font: '10px system-ui, sans-serif', color: 'rgba(120,120,120,0.75)',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
}
"""
