from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status

from backend.models import (
    ModuleQuestion,
    QuestionModule,
    QuestionModuleSummary,
    QuestionModuleUpdate,
    User,
)
from backend.routers.auth import get_current_active_analyst, get_current_user
from backend.services.question_module_service import question_module_service
from backend.utils.module_rollout_flags import get_module_rollout_payload

router = APIRouter(prefix="/modules", tags=["question-modules"])


@router.get("/rollout")
async def get_module_rollout(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Phase 9 rollout stage and enabled capabilities."""
    return get_module_rollout_payload()


@router.get("/", response_model=List[QuestionModuleSummary])
async def list_modules(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List active question modules (metadata only, latest version per module_id)."""
    return await question_module_service.list_active_summaries()


@router.get("/{module_id}", response_model=QuestionModule)
async def get_module(
    module_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Full module definition — latest active version."""
    doc = await question_module_service.get_active_module(module_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active module '{module_id}' not found",
        )
    return doc


@router.get("/{module_id}/questions", response_model=List[ModuleQuestion])
async def get_module_questions(
    module_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Flat question list for a module (section order → question order)."""
    doc = await question_module_service.get_active_module(module_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active module '{module_id}' not found",
        )
    flat = await question_module_service.get_active_questions_flat(module_id)
    return [
        {k: v for k, v in q.items() if not k.startswith("section_")}
        for q in flat
    ]


@router.put("/{module_id}", response_model=QuestionModule)
async def update_module(
    module_id: str,
    payload: QuestionModuleUpdate,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    Analyst update — validates payload, deactivates prior version, inserts new version.
    """
    if not module_id.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid module_id format")

    try:
        doc = await question_module_service.upsert_module_version(
            module_id,
            payload,
            username=current_user.username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return doc
