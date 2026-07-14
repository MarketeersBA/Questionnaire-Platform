"""
Product Test question bank — health checks and collection metadata.

Used by:
  - GET /product-test-questions/status (pre-flight before blueprint generation)
  - seed_product_test_data.py --verify-only
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from backend.database import db
from backend.models import ProductTestBankStatus

COLLECTION_PRODUCT = "product_test_questions"
COLLECTION_PACKAGE = "package_test_questions"
COLLECTION_META = "product_test_bank_meta"
META_DOC_ID = "bank_meta"


class ProductTestBankService:
    """Read-only health and metadata for the product/package test question banks."""

    def _product_col(self):
        return db.get_collection(COLLECTION_PRODUCT)

    def _package_col(self):
        return db.get_collection(COLLECTION_PACKAGE)

    def _meta_col(self):
        return db.get_collection(COLLECTION_META)

    async def get_bank_status(self) -> ProductTestBankStatus:
        pt_col = self._product_col()
        pkg_col = self._package_col()

        product_count = await pt_col.count_documents({})
        package_count = await pkg_col.count_documents({})
        fixed_count = await pt_col.count_documents({"question_status": "fixed"})
        optional_count = await pt_col.count_documents({"question_status": "optional"})
        package_fixed_count = await pkg_col.count_documents({"question_status": "fixed"})
        package_optional_count = await pkg_col.count_documents({"question_status": "optional"})

        meta = await self._meta_col().find_one({"_id": META_DOC_ID}) or {}

        # Minimum viable bank: at least one fixed product question (always included in blueprint)
        seeded = product_count > 0 and fixed_count > 0
        # Full bank: product + package rows present (package test module can attach)
        healthy = seeded and package_count > 0

        return ProductTestBankStatus(
            product_count=product_count,
            package_count=package_count,
            fixed_count=fixed_count,
            optional_count=optional_count,
            package_fixed_count=package_fixed_count,
            package_optional_count=package_optional_count,
            seeded=seeded,
            healthy=healthy,
            last_seeded_at=meta.get("last_seeded_at"),
            seed_source=meta.get("source"),
            excel_available=meta.get("excel_available"),
        )

    async def write_seed_metadata(
        self,
        *,
        source: str,
        product_count: int,
        package_count: int,
        fixed_count: int,
        source_path: Optional[str] = None,
        excel_available: bool = False,
    ) -> None:
        """Persist last-seed metadata for status endpoint and ops visibility."""
        now = datetime.utcnow()
        doc: Dict[str, Any] = {
            "_id": META_DOC_ID,
            "source": source,
            "source_path": source_path,
            "product_count": product_count,
            "package_count": package_count,
            "fixed_count": fixed_count,
            "last_seeded_at": now,
            "excel_available": excel_available,
            "updated_at": now,
        }
        await self._meta_col().replace_one({"_id": META_DOC_ID}, doc, upsert=True)


product_test_bank_service = ProductTestBankService()
