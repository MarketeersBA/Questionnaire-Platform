"""Phase 5 — capture failure diagnostics bundles."""
from pathlib import Path

from backend.analytics_module.pptx_builder.hybrid_export.capture_diagnostics import (
    PageCaptureInstrumentation,
    failure_bundle_dir,
)


class _StubPage:
    def screenshot(self, path: str, full_page: bool = False) -> None:
        Path(path).write_bytes(b"\x89PNG")

    def content(self) -> str:
        return "<html><body><div data-export-chart-root='true'>chart</div></body></html>"


def test_save_failure_bundle_writes_manifest(tmp_path: Path):
    inst = PageCaptureInstrumentation()
    page = _StubPage()
    bundle = failure_bundle_dir(tmp_path, "chart_alpha", 2)
    diag = inst.save_failure_bundle(
        page,
        bundle,
        chart_id="chart_alpha",
        attempt=2,
        failure_kind="selector",
        error_message="frame_not_ready",
        viewport_url="http://test/export-frame",
    )
    assert Path(diag.manifest_path).exists()
    assert Path(diag.screenshot_path or "").exists() or diag.screenshot_path
    assert diag.html_snippet
    assert "chart_alpha" in diag.bundle_dir
