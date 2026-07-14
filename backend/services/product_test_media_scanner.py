"""
Malware scan hook for trial media — pluggable before analyst download.

Default: scan disabled (skipped). Enable with PRODUCT_TEST_MEDIA_SCAN_ENABLED=true
and optionally replace scan_trial_media_asset with ClamAV / cloud scanner integration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

from backend.config import settings
from backend.trial_media_capture.constants import (
    SCAN_CLEAN,
    SCAN_PENDING,
    SCAN_QUARANTINED,
    SCAN_SKIPPED,
)

logger = logging.getLogger(__name__)

ScanStatusResult = Literal["pending", "clean", "quarantined", "skipped"]


@dataclass(frozen=True)
class TrialMediaScanResult:
    status: ScanStatusResult
    detail: Optional[str] = None
    scanner: str = "default"


async def scan_trial_media_asset(
    registry: Dict[str, Any],
    *,
    asset_id: str,
) -> TrialMediaScanResult:
    """
    Hook point for external malware scanners.

    Override this module or register a custom scanner in production deployments.
    """
    if not settings.PRODUCT_TEST_MEDIA_SCAN_ENABLED:
        return TrialMediaScanResult(status=SCAN_SKIPPED, detail="Scan disabled", scanner="none")

    # Stub: trusted test environments mark clean immediately.
    # Replace with real scanner integration for untrusted respondent uploads.
    if settings.PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN:
        return TrialMediaScanResult(
            status=SCAN_CLEAN,
            detail="Stub scanner passed",
            scanner="stub",
        )

    return TrialMediaScanResult(
        status=SCAN_PENDING,
        detail="Awaiting external scanner",
        scanner="pending",
    )


def initial_scan_status() -> str:
    if not settings.PRODUCT_TEST_MEDIA_SCAN_ENABLED:
        return SCAN_SKIPPED
    if settings.PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN:
        return SCAN_CLEAN
    return SCAN_PENDING


async def apply_scan_result_to_registry(asset_id: str, result: TrialMediaScanResult) -> None:
    from backend.database import db
    from backend.trial_media_capture.constants import MEDIA_ASSETS_COLLECTION

    await db.get_collection(MEDIA_ASSETS_COLLECTION).update_one(
        {"asset_id": asset_id},
        {
            "$set": {
                "scan_status": result.status,
                "scan_detail": result.detail,
                "scan_engine": result.scanner,
            }
        },
    )


async def ensure_analyst_scan_clear(registry: Dict[str, Any]) -> None:
    """Block analyst stream/download for quarantined or pending scans when configured."""
    from backend.services.product_test_media_asset_service import ProductTestMediaAssetError

    status = registry.get("scan_status") or SCAN_SKIPPED
    if status == SCAN_QUARANTINED:
        raise ProductTestMediaAssetError(
            "This file is quarantined and cannot be downloaded.",
            status_code=403,
        )
    if status == SCAN_PENDING and settings.PRODUCT_TEST_MEDIA_BLOCK_PENDING_ANALYST:
        raise ProductTestMediaAssetError(
            "This file is awaiting a security scan. Try again later.",
            status_code=423,
        )
