"""
Cleanup abandoned product test trial media uploads.

Usage:
  python -m backend.scripts.cleanup_abandoned_trial_media --dry-run
  python -m backend.scripts.cleanup_abandoned_trial_media --apply
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from backend.database import db
from backend.services.product_test_media_lifecycle import cleanup_abandoned_trial_media

logger = logging.getLogger(__name__)


async def run(*, dry_run: bool, limit: int, ttl_hours: int | None, grace_hours: int | None) -> dict:
    db.connect()
    try:
        await db.ensure_indexes()
        return await cleanup_abandoned_trial_media(
            dry_run=dry_run,
            limit=limit,
            abandoned_ttl_hours=ttl_hours,
            unreferenced_grace_hours=grace_hours,
        )
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup abandoned trial media uploads")
    parser.add_argument("--dry-run", action="store_true", help="Report candidates without deleting")
    parser.add_argument("--apply", action="store_true", help="Delete abandoned assets")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--ttl-hours", type=int, default=None)
    parser.add_argument("--grace-hours", type=int, default=None)
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.error("Specify --dry-run or --apply")

    logging.basicConfig(level=logging.INFO)
    stats = asyncio.run(
        run(
            dry_run=not args.apply,
            limit=args.limit,
            ttl_hours=args.ttl_hours,
            grace_hours=args.grace_hours,
        )
    )
    print(json.dumps(stats, indent=2, default=str))


if __name__ == "__main__":
    main()
