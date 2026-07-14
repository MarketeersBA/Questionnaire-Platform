"""
Phase 9 QA test matrix runner.

Executes backend pytest suites + optional seed dry-run validation.

Usage:
  python -m backend.scripts.run_phase9_qa
  python -m backend.scripts.run_phase9_qa --skip-seed-dry-run
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PHASE9_TESTS = [
    "backend/tests/test_phase9_seed_contract.py",
    "backend/tests/test_question_modules_router.py",
    "backend/tests/test_question_module_service_versioning.py",
    "backend/tests/test_module_specify_roundtrip.py",
    "backend/tests/test_exports_modules.py",
    "backend/tests/test_module_rollout_flags.py",
    "backend/tests/test_module_answer_aliases.py",
    "backend/tests/test_question_modules.py",
    "backend/tests/test_question_module_parsers.py",
    "backend/tests/analytics/test_ingestor_modules.py",
    "backend/tests/analytics/test_aggregator_modules.py",
]


def run_pytest(files: list[str]) -> int:
    cmd = [sys.executable, "-m", "pytest", *files, "-q", "-o", "addopts="]
    print(f"\n>>> {' '.join(cmd)}\n")
    return subprocess.call(cmd, cwd=str(ROOT))


def run_seed_dry_run() -> int:
    cmd = [sys.executable, "-m", "backend.scripts.seed_question_modules", "--dry-run"]
    print(f"\n>>> {' '.join(cmd)}\n")
    return subprocess.call(cmd, cwd=str(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Phase 9 QA test matrix")
    parser.add_argument("--skip-seed-dry-run", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("Phase 9 QA — Backend Test Matrix")
    print("=" * 60)

    exit_code = 0

    if not args.skip_seed_dry_run:
        seed_rc = run_seed_dry_run()
        if seed_rc != 0:
            print("WARN: seed dry-run failed (Excel missing or validation error)")

    test_rc = run_pytest(PHASE9_TESTS)
    if test_rc != 0:
        exit_code = test_rc

    print("\n" + "=" * 60)
    if exit_code == 0:
        print("Phase 9 backend QA: PASSED")
    else:
        print("Phase 9 backend QA: FAILED")
    print("=" * 60)
    print("\nFrontend (run separately):")
    print("  cd frontend && npm run test -- --run moduleSequencePermutations purchaseFunnelBrandLogic surveyFlowOrchestration moduleRollout moduleQuestionUtils")

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
