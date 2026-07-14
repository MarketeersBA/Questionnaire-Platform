"""
Phase 7 QA test matrix — trial media capture rollout.

Usage:
  python -m backend.scripts.run_trial_media_phase7_qa
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PHASE7_BACKEND_TESTS = [
    "backend/tests/test_trial_media_rollout_flags.py",
    "backend/tests/test_trial_media_capture_phase7.py",
    "backend/tests/test_trial_media_upload_validation_phase7.py",
    "backend/tests/test_trial_media_capture_snapshot.py",
    "backend/tests/test_product_test_models.py",
    "backend/tests/test_product_test_media_asset_service.py",
    "backend/tests/test_product_test_media_lifecycle.py",
    "backend/tests/test_product_test_value_classification.py",
    "backend/tests/test_product_test_analytics_service.py",
]

PHASE7_FRONTEND_TESTS = [
    "src/utils/trialMediaRollout.test.ts",
    "src/utils/productTestConfigModalTrialMedia.test.ts",
    "src/utils/trialMediaCapturePhase7.test.ts",
    "src/utils/trialMediaCaptureConfig.test.ts",
    "src/utils/trialMediaCaptureSnapshot.test.ts",
    "src/utils/productTestPreview.test.ts",
    "src/utils/productTestFlowOrchestration.test.ts",
    "src/utils/productTestMediaAnswer.test.ts",
]


def run_pytest(files: list[str]) -> int:
    cmd = [sys.executable, "-m", "pytest", *files, "-q", "-o", "addopts="]
    print(f"\n>>> {' '.join(cmd)}\n")
    return subprocess.call(cmd, cwd=str(ROOT))


def run_vitest(files: list[str]) -> int:
    import shutil
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        print("npm not found — skip frontend vitest in this environment")
        return 0
    cmd = [npm, "test", "--", "--run", *files]
    print(f"\n>>> {' '.join(cmd)}\n")
    return subprocess.call(cmd, cwd=str(ROOT / "frontend"))


def main() -> int:
    code = run_pytest(PHASE7_BACKEND_TESTS)
    if code != 0:
        return code
    return run_vitest(PHASE7_FRONTEND_TESTS)


if __name__ == "__main__":
    raise SystemExit(main())
