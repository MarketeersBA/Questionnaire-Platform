from fastapi import APIRouter, Depends, HTTPException
from typing import List, Annotated
from backend.models import ProductTestQuestion, PackageTestQuestion, ProductTestBankStatus, User
from backend.database import db
from backend.routers.auth import get_current_user
from backend.services.product_test_bank_service import product_test_bank_service

router = APIRouter(tags=["product-test-questions"])


@router.get("/product-test-questions/status", response_model=ProductTestBankStatus)
async def get_product_test_bank_status(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Lightweight health check for product/package test question banks.
    Use before blueprint generation to detect an empty or unseeded bank.
    """
    return await product_test_bank_service.get_bank_status()


@router.get("/product-test-questions/", response_model=List[ProductTestQuestion])
async def list_product_test_questions(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """List all product test questions sorted by order."""
    col = db.get_collection("product_test_questions")
    cursor = col.find({}).sort("order", 1)
    questions = await cursor.to_list(length=200)
    return questions


@router.get("/product-test-questions/{question_id}", response_model=ProductTestQuestion)
async def get_product_test_question(
    question_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get a single product test question by ID."""
    col = db.get_collection("product_test_questions")
    question = await col.find_one({"question_id": question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Product test question not found")
    return question


@router.get("/package-test-questions/", response_model=List[PackageTestQuestion])
async def list_package_test_questions(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """List all package test questions sorted by order."""
    col = db.get_collection("package_test_questions")
    cursor = col.find({}).sort("order", 1)
    questions = await cursor.to_list(length=200)
    return questions
