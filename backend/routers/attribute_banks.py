from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Annotated, Dict
from datetime import datetime
from backend.models import AttributeBank, AttributeBankCreate, User
from backend.database import db
from backend.routers.auth import get_current_user, get_current_active_admin

router = APIRouter(prefix="/attribute-banks", tags=["attribute-banks"])

@router.post("/", response_model=AttributeBank)
async def create_or_update_attribute_bank(
    bank_in: AttributeBankCreate,
    current_admin: Annotated[User, Depends(get_current_active_admin)]
):
    banks_col = db.get_collection("attribute_banks")
    
    # Check if category exists
    existing = await banks_col.find_one({"category": bank_in.category.lower()})
    
    now = datetime.utcnow()
    bank_dict = bank_in.model_dump()
    bank_dict["category"] = bank_dict["category"].lower()
    
    if existing:
        # Update version and content
        new_version = existing.get("version", 1) + 1
        bank_dict["version"] = new_version
        bank_dict["updated_at"] = now
        bank_dict["created_at"] = existing["created_at"]
        
        await banks_col.replace_one(
            {"_id": existing["_id"]},
            bank_dict
        )
        updated = await banks_col.find_one({"_id": existing["_id"]})
        return updated
    else:
        # Create new
        bank_dict["version"] = 1
        bank_dict["created_at"] = now
        bank_dict["updated_at"] = now
        
        result = await banks_col.insert_one(bank_dict)
        created = await banks_col.find_one({"_id": result.inserted_id})
        return created

@router.get("/", response_model=List[Dict[str, str]])
async def list_categories(
    current_user: Annotated[User, Depends(get_current_user)]
):
    banks_col = db.get_collection("attribute_banks")
    cursor = banks_col.find({}, {"category": 1, "display_name": 1, "_id": 0})
    categories = await cursor.to_list(length=100)
    return categories

@router.get("/{category}", response_model=AttributeBank)
async def get_attribute_bank(
    category: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    banks_col = db.get_collection("attribute_banks")
    bank = await banks_col.find_one({"category": category.lower()})
    if not bank:
        raise HTTPException(status_code=404, detail="Category not found")
    return bank
