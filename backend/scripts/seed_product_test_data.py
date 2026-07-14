"""
Seed product_test_questions and package_test_questions collections.

Idempotent: full replace on each run (canonical bank from Excel or fixture).

Usage:
  python -m backend.scripts.seed_product_test_data
  python -m backend.scripts.seed_product_test_data --xlsx path/to/workbook.xlsx
  python -m backend.scripts.seed_product_test_data --fixture
  python -m backend.scripts.seed_product_test_data --dry-run
  python -m backend.scripts.seed_product_test_data --verify-only
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

sys.stdout.reconfigure(encoding="utf-8")

from backend.database import db
from backend.scripts.product_test_parsers import parse_product_test_workbook
from backend.scripts.product_test_seed_definitions import (
    DEFAULT_XLSX,
    load_fixture_bank,
    resolve_xlsx_path,
    summarize_bank,
)
from backend.services.product_test_bank_service import (
    COLLECTION_PACKAGE,
    COLLECTION_PRODUCT,
    product_test_bank_service,
)


def _stamp_timestamps(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    stamped = []
    for q in questions:
        row = dict(q)
        row.setdefault("created_at", now)
        row["updated_at"] = now
        return_row = row
        stamped.append(return_row)
    return stamped


async def _load_bank(
    *,
    xlsx_path: Path | None,
    use_fixture: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], str, str | None, bool]:
    excel_available = DEFAULT_XLSX.is_file()

    if use_fixture:
        product, package = load_fixture_bank()
        return product, package, "fixture", str(DEFAULT_XLSX) if excel_available else None, excel_available

    path = xlsx_path or DEFAULT_XLSX
    if path.is_file():
        product, package = parse_product_test_workbook(path)
        return product, package, "excel", str(path), True

    if excel_available:
        product, package = parse_product_test_workbook(DEFAULT_XLSX)
        return product, package, "excel", str(DEFAULT_XLSX), True

    print(f"Excel not found at {path}; falling back to embedded fixture.")
    product, package = load_fixture_bank()
    return product, package, "fixture", str(path), False


async def seed_product_test_data(
    *,
    xlsx_path: Path | None = None,
    use_fixture: bool = False,
    dry_run: bool = False,
) -> Dict[str, int]:
    product_questions, package_questions, source, source_path, excel_available = await _load_bank(
        xlsx_path=xlsx_path,
        use_fixture=use_fixture,
    )
    product_questions = _stamp_timestamps(product_questions)
    package_questions = _stamp_timestamps(package_questions)
    summary = summarize_bank(product_questions, package_questions)

    print(f"Source: {source}" + (f" ({source_path})" if source_path else ""))
    print(f"Parsed {summary['product_count']} product questions ({summary['fixed_count']} fixed, {summary['optional_count']} optional).")
    print(f"Parsed {summary['package_count']} package questions.")

    if dry_run:
        print("[dry-run] Skipping database write.")
        return summary

    db.connect()
    try:
        pt_col = db.get_collection(COLLECTION_PRODUCT)
        pk_col = db.get_collection(COLLECTION_PACKAGE)

        await pt_col.delete_many({})
        if product_questions:
            await pt_col.insert_many(product_questions)
            print(f"Seeded {COLLECTION_PRODUCT}.")

        await pk_col.delete_many({})
        if package_questions:
            await pk_col.insert_many(package_questions)
            print(f"Seeded {COLLECTION_PACKAGE}.")

        await product_test_bank_service.write_seed_metadata(
            source=source,
            product_count=summary["product_count"],
            package_count=summary["package_count"],
            fixed_count=summary["fixed_count"],
            source_path=source_path,
            excel_available=excel_available,
        )
        print("Wrote product_test_bank_meta.")
    finally:
        db.close()

    pf_count = sum(1 for q in product_questions if q.get("diagnostic_tag") == "PF")
    em_count = sum(1 for q in product_questions if q.get("diagnostic_tag") == "EM")
    print(f"Diagnostic tags — PF: {pf_count}, EM: {em_count}")
    print("Product test bank seed completed.")
    return summary


async def verify_bank() -> int:
    """Exit 0 if bank is seeded (product + fixed), else 1."""
    db.connect()
    try:
        status = await product_test_bank_service.get_bank_status()

        # Backfill metadata for banks seeded before meta tracking existed
        if status.seeded and not status.last_seeded_at:
            await product_test_bank_service.write_seed_metadata(
                source="legacy",
                product_count=status.product_count,
                package_count=status.package_count,
                fixed_count=status.fixed_count,
                source_path=None,
                excel_available=DEFAULT_XLSX.is_file(),
            )
            status = await product_test_bank_service.get_bank_status()
    finally:
        db.close()

    print("--- Product Test Bank Status ---")
    print(f"  product_count:  {status.product_count}")
    print(f"  package_count:  {status.package_count}")
    print(f"  fixed_count:    {status.fixed_count}")
    print(f"  optional_count: {status.optional_count}")
    print(f"  seeded:         {status.seeded}")
    print(f"  healthy:        {status.healthy}")
    if status.last_seeded_at:
        print(f"  last_seeded_at: {status.last_seeded_at}")
    if status.seed_source:
        print(f"  seed_source:    {status.seed_source}")

    if not status.seeded:
        print("\nBank NOT seeded. Run: python -m backend.scripts.seed_product_test_data")
        return 1
    print("\nBank OK.")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Seed product/package test question banks")
    p.add_argument("--xlsx", type=str, help=f"Excel workbook path (default: {DEFAULT_XLSX})")
    p.add_argument("--fixture", action="store_true", help="Force embedded JSON fixture (skip Excel)")
    p.add_argument("--dry-run", action="store_true", help="Parse only; do not write to MongoDB")
    p.add_argument("--verify-only", action="store_true", help="Check bank health and exit")
    return p


def main() -> None:
    args = _build_parser().parse_args()

    if args.verify_only:
        raise SystemExit(asyncio.run(verify_bank()))

    xlsx = resolve_xlsx_path(args.xlsx) if args.xlsx else None
    asyncio.run(
        seed_product_test_data(
            xlsx_path=xlsx,
            use_fixture=args.fixture,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
