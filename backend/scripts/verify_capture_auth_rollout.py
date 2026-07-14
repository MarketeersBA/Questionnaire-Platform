#!/usr/bin/env python3
"""
Phase 7 rollout verification — capture auth without a full PPTX export.

Checks:
  1. SECRET_KEY present (worker can mint JWTs)
  2. Capture token mint + decode
  3. Optional HTTP probe of report API (same as preflight)
  4. Config validation (no static PPTX_CAPTURE_AUTH_TOKEN required)

Usage:
  python -m backend.scripts.verify_capture_auth_rollout --survey-id <id>
  python -m backend.scripts.verify_capture_auth_rollout --survey-id <id> --probe-api
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify PPTX capture auth rollout")
    parser.add_argument("--survey-id", required=True, help="Survey id to scope the capture JWT")
    parser.add_argument(
        "--probe-api",
        action="store_true",
        help="HTTP GET report API with minted token (requires reachable frontend/API)",
    )
    args = parser.parse_args()

    from backend.config import settings
    from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
        create_capture_access_token,
        decode_capture_access_token,
    )
    from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
        validate_capture_configuration,
    )
    from backend.analytics_module.pptx_builder.hybrid_export.capture_session import (
        capture_auth_token_override_enabled,
        resolve_capture_session_for_batch,
    )

    errors: list[str] = []

    if not (settings.SECRET_KEY or "").strip():
        errors.append("SECRET_KEY is not set — worker cannot mint capture JWTs.")

    if os.environ.get("PPTX_CAPTURE_AUTH_TOKEN", "").strip() and not capture_auth_token_override_enabled():
        errors.append(
            "PPTX_CAPTURE_AUTH_TOKEN is set but PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE is not true — "
            "static token is ignored; remove it or enable override for debug only."
        )

    cfg_result = validate_capture_configuration()
    if not cfg_result.ok:
        for issue in cfg_result.issues:
            errors.append(f"[{issue.code}] {issue.message}")

    try:
        token = create_capture_access_token(survey_id=args.survey_id, role="admin")
        claims = decode_capture_access_token(token, expected_survey_id=args.survey_id)
        print(f"OK  Minted capture JWT | role={claims.role} survey_id={claims.survey_id}")
    except Exception as exc:
        errors.append(f"Token mint/decode failed: {exc}")

    try:
        resolution = resolve_capture_session_for_batch(survey_id=args.survey_id)
        entries = resolution.session.storage_entries()
        if not entries.get("token"):
            errors.append("CaptureSessionContext.storage_entries() missing token")
        else:
            print(f"OK  Session source={resolution.source} storage_keys={list(entries.keys())}")
    except Exception as exc:
        errors.append(f"Session resolution failed: {exc}")

    if args.probe_api:
        from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
            run_pre_capture_checks,
        )

        result = run_pre_capture_checks(args.survey_id, report_id="rollout-verify")
        if result.ok:
            print("OK  Pre-capture checks passed (includes report API auth probe)")
        else:
            for issue in result.issues:
                errors.append(f"Preflight [{issue.code}] {issue.message}")

    if errors:
        print("\nFAILED rollout verification:")
        for line in errors:
            print(f"  - {line}")
        return 1

    print("\nPASSED capture auth rollout verification.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
