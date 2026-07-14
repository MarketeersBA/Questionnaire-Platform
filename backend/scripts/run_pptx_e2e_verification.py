"""
Phase F — Native PPTX end-to-end verification.

Generates a native deck from the protein-bar taste-test fixture (full screen chart
coverage), runs PRODUCTION validation, and writes a per-chart coverage report.

Usage:
  python -m backend.scripts.run_pptx_e2e_verification
  python -m backend.scripts.run_pptx_e2e_verification --fixture representative
  python -m backend.scripts.run_pptx_e2e_verification --output-dir ./pptx_e2e_out
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.tests.analytics.pptx_acceptance_contract import (  # noqa: E402
    build_protein_bar_screen_report,
    build_representative_screen_report,
)
from backend.tests.analytics.pptx_e2e_coverage import (  # noqa: E402
    build_per_chart_coverage_report,
    format_coverage_report_markdown,
    run_native_e2e_export_sync,
    write_coverage_artifacts,
)

TEMPLATE_PATH = (
    ROOT / "backend" / "resources" / "analytics" / "marketeers_template.pptx"
)
DEFAULT_OUTPUT = ROOT / "backend" / "tests" / "analytics" / "artifacts" / "pptx_e2e"


def _load_fixture(name: str) -> dict:
    if name == "protein_bar":
        return build_protein_bar_screen_report()
    if name == "representative":
        return build_representative_screen_report()
    raise ValueError(f"Unknown fixture: {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Phase F native PPTX E2E verification")
    parser.add_argument(
        "--fixture",
        choices=("protein_bar", "representative"),
        default="protein_bar",
        help="Taste-test report fixture (default: protein_bar = full screen coverage)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Directory for deck + coverage artifacts",
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Print JSON coverage report to stdout instead of markdown summary",
    )
    args = parser.parse_args()

    os.environ["PPTX_RENDER_MODE"] = "native"

    if not TEMPLATE_PATH.is_file():
        print(f"ERROR: template missing at {TEMPLATE_PATH}", file=sys.stderr)
        sys.exit(2)

    report_doc = _load_fixture(args.fixture)
    output_dir = args.output_dir / args.fixture

    print("=" * 60)
    print("Phase F — Native PPTX E2E Verification")
    print("=" * 60)
    print(f"Fixture:     {args.fixture}")
    print(f"Render mode: native (PPTX_RENDER_MODE=native)")
    print(f"Charts:      {len(report_doc.get('charts', []))}")
    print(f"Template:    {TEMPLATE_PATH}")
    print(f"Output:      {output_dir}")
    print()

    export_result = run_native_e2e_export_sync(
        report_doc,
        template_path=TEMPLATE_PATH,
        render_mode="native",
    )
    coverage = build_per_chart_coverage_report(export_result)
    artifact_paths = write_coverage_artifacts(
        coverage,
        output_dir=output_dir,
        deck_bytes=export_result.pptx_stream.getvalue(),
        deck_filename=f"{args.fixture}_native_e2e.pptx",
    )

    print(f"PRODUCTION gate: {'PASS' if coverage['production_passes_gate'] else 'FAIL'}")
    print(f"Chart coverage:  {coverage['passed_chart_count']}/{coverage['chart_count']} passed")
    print(f"Slides:          {coverage['slide_count']}")
    print(f"Artifacts:")
    for label, path in artifact_paths.items():
        print(f"  {label}: {path}")

    if coverage["failed_rows"]:
        print("\nFailed charts:")
        for row in coverage["failed_rows"]:
            print(
                f"  - {row['chart_id']}: render={row['render_status']}, "
                f"numeric={row['numeric_evidence_reason']}"
            )

    print()
    if args.json_only:
        print(json.dumps(coverage, indent=2, default=str))
    else:
        print(format_coverage_report_markdown(coverage))

    sys.exit(0 if coverage["production_passes_gate"] and coverage["summary"]["all_charts_passed"] else 1)


if __name__ == "__main__":
    main()
