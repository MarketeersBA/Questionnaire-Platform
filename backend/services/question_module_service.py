"""
Question module registry service.

Each module_id can have multiple versioned documents in `question_modules`.
Exactly one document per module_id should have is_active=True (the latest).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from backend.database import db
from backend.models import (
    ModuleSection,
    QuestionModule,
    QuestionModuleCreate,
    QuestionModuleSummary,
    QuestionModuleUpdate,
)

COLLECTION = "question_modules"


def _count_questions(sections: List[Dict[str, Any]]) -> int:
    return sum(len(s.get("questions") or []) for s in sections)


def serialize_module_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    if "_id" in doc:
        doc = {**doc, "_id": str(doc["_id"])}
    return doc


def canonical_module_content(
    name: str,
    description: Optional[str],
    sections: List[ModuleSection],
) -> str:
    """Stable JSON fingerprint for idempotent seed comparisons."""
    payload = {
        "name": name,
        "description": description or "",
        "sections": [s.model_dump() for s in sections],
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


def flatten_questions(sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return all questions sorted by section order then question order."""
    sorted_sections = sorted(sections or [], key=lambda s: s.get("order", 0))
    flat: List[Dict[str, Any]] = []
    for section in sorted_sections:
        questions = sorted(section.get("questions") or [], key=lambda q: q.get("order", 0))
        for q in questions:
            flat.append(
                {
                    **q,
                    "section_id": section.get("section_id"),
                    "section_title_en": section.get("title_en"),
                    "section_title_ar": section.get("title_ar"),
                }
            )
    return flat


class QuestionModuleService:
    @property
    def _col(self):
        return db.get_collection(COLLECTION)

    async def list_active_summaries(self) -> List[QuestionModuleSummary]:
        """Latest active version per module_id (metadata only)."""
        pipeline = [
            {"$match": {"is_active": True}},
            {"$sort": {"module_id": 1, "version": -1}},
            {
                "$group": {
                    "_id": "$module_id",
                    "doc": {"$first": "$$ROOT"},
                }
            },
            {"$replaceRoot": {"newRoot": "$doc"}},
            {"$sort": {"module_id": 1}},
        ]
        cursor = self._col.aggregate(pipeline)
        docs = await cursor.to_list(length=50)
        return [self._to_summary(d) for d in docs]

    async def get_active_module(self, module_id: str) -> Optional[Dict[str, Any]]:
        doc = await self._col.find_one(
            {"module_id": module_id, "is_active": True},
            sort=[("version", -1)],
        )
        return serialize_module_doc(doc)

    async def get_active_questions_flat(self, module_id: str) -> List[Dict[str, Any]]:
        doc = await self.get_active_module(module_id)
        if not doc:
            return []
        return flatten_questions(doc.get("sections") or [])

    async def get_module_version(
        self, module_id: str, version: int
    ) -> Optional[Dict[str, Any]]:
        doc = await self._col.find_one({"module_id": module_id, "version": version})
        return serialize_module_doc(doc)

    async def upsert_module_version(
        self,
        module_id: str,
        payload: QuestionModuleUpdate,
        *,
        username: str,
    ) -> Dict[str, Any]:
        """
        Deactivate the current active version and insert a new one with version+1.
        If no prior version exists, starts at version 1.
        """
        now = datetime.utcnow()
        latest = await self._col.find_one(
            {"module_id": module_id},
            sort=[("version", -1)],
        )

        next_version = (latest["version"] + 1) if latest else 1

        # Validate structure via Pydantic before writing
        candidate = QuestionModule(
            module_id=module_id,
            name=payload.name,
            description=payload.description,
            version=next_version,
            is_active=True,
            sections=payload.sections,
            question_count=_count_questions(
                [s.model_dump() for s in payload.sections]
            ),
            created_by=username,
            updated_by=username,
            created_at=now,
            updated_at=now,
        )

        await self._col.update_many(
            {"module_id": module_id, "is_active": True},
            {"$set": {"is_active": False, "updated_at": now}},
        )

        insert_doc = candidate.model_dump(by_alias=True, exclude={"id"})
        insert_doc.pop("_id", None)
        result = await self._col.insert_one(insert_doc)
        created = await self._col.find_one({"_id": result.inserted_id})
        return serialize_module_doc(created)  # type: ignore[return-value]

    async def create_initial_module(
        self,
        module_id: str,
        payload: QuestionModuleCreate,
        *,
        username: str,
    ) -> Dict[str, Any]:
        """Insert version 1 when no document exists for module_id."""
        existing = await self._col.find_one({"module_id": module_id})
        if existing:
            raise ValueError(
                f"Module '{module_id}' already exists; use sync_module instead"
            )

        now = datetime.utcnow()
        module = QuestionModule(
            module_id=module_id,
            name=payload.name,
            description=payload.description,
            version=1,
            is_active=True,
            sections=payload.sections,
            question_count=_count_questions(
                [s.model_dump() for s in payload.sections]
            ),
            created_by=username,
            updated_by=username,
            created_at=now,
            updated_at=now,
        )
        insert_doc = module.model_dump(by_alias=True, exclude={"id"})
        insert_doc.pop("_id", None)
        result = await self._col.insert_one(insert_doc)
        created = await self._col.find_one({"_id": result.inserted_id})
        return serialize_module_doc(created)  # type: ignore[return-value]

    async def sync_module(
        self,
        module_id: str,
        payload: QuestionModuleCreate,
        *,
        username: str,
        force: bool = False,
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Idempotent seed entry point.

        Returns (module_doc, changed) where changed=False means the active
        version already matches the payload and no new version was written.
        """
        fingerprint = canonical_module_content(
            payload.name, payload.description, payload.sections
        )
        active = await self.get_active_module(module_id)

        if active and not force:
            active_fp = canonical_module_content(
                active["name"],
                active.get("description"),
                [ModuleSection(**s) for s in active.get("sections") or []],
            )
            if active_fp == fingerprint:
                return active, False

        update = QuestionModuleUpdate(
            name=payload.name,
            description=payload.description,
            sections=payload.sections,
        )
        if not active:
            any_doc = await self._col.find_one({"module_id": module_id})
            if not any_doc:
                created = await self.create_initial_module(
                    module_id, payload, username=username
                )
                return created, True

        doc = await self.upsert_module_version(
            module_id, update, username=username
        )
        return doc, True

    def build_snapshot(
        self, module_doc: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Produce a survey-safe frozen copy from an active module document."""
        from backend.models import ModuleSnapshot

        snapshot = ModuleSnapshot(
            module_id=module_doc["module_id"],
            name=module_doc["name"],
            description=module_doc.get("description"),
            version=module_doc.get("version", 1),
            is_active=True,
            sections=module_doc.get("sections") or [],
            question_count=module_doc.get("question_count")
            or _count_questions(module_doc.get("sections") or []),
            source_version=module_doc.get("version", 1),
            snapshotted_at=datetime.utcnow(),
        )
        return snapshot.model_dump()

    def _to_summary(self, doc: Dict[str, Any]) -> QuestionModuleSummary:
        sections = doc.get("sections") or []
        return QuestionModuleSummary(
            module_id=doc["module_id"],
            name=doc["name"],
            description=doc.get("description"),
            version=doc.get("version", 1),
            is_active=doc.get("is_active", False),
            question_count=doc.get("question_count") or _count_questions(sections),
            section_count=len(sections),
            updated_at=doc.get("updated_at") or datetime.utcnow(),
        )


question_module_service = QuestionModuleService()
