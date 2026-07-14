from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Annotated
from datetime import datetime
from backend.models import BrandAttribute, BrandAttributeBank, User
from backend.database import db
from backend.routers.auth import get_current_user, get_current_active_admin

router = APIRouter(prefix="/brand-attributes", tags=["brand-attributes"])

@router.get("/bank", response_model=BrandAttributeBank)
async def get_brand_attribute_bank(
    current_user: Annotated[User, Depends(get_current_user)]
):
    col = db.get_collection("brand_attribute_banks")
    bank = await col.find_one({"is_global": True})
    if not bank:
        # Create empty default if not exists
        default_bank = {
            "name": "Standard Brand Image Bank",
            "is_global": True,
            "attributes": [],
            "updated_at": datetime.utcnow()
        }
        res = await col.insert_one(default_bank)
        bank = await col.find_one({"_id": res.inserted_id})
    return bank

@router.post("/bank/attributes", response_model=BrandAttributeBank)
async def add_attribute_to_bank(
    attr: BrandAttribute,
    current_admin: Annotated[User, Depends(get_current_active_admin)]
):
    col = db.get_collection("brand_attribute_banks")
    bank = await col.find_one({"is_global": True})
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found")
    
    # Check if ID already exists
    existing_attrs = bank.get("attributes", [])
    if any(a["id"] == attr.id for a in existing_attrs):
        raise HTTPException(status_code=400, detail="Attribute ID already exists")
    
    await col.update_one(
        {"_id": bank["_id"]},
        {
            "$push": {"attributes": attr.model_dump()},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return await col.find_one({"_id": bank["_id"]})

@router.put("/bank/attributes/{attr_id}", response_model=BrandAttributeBank)
async def update_attribute_in_bank(
    attr_id: str,
    attr_update: BrandAttribute,
    current_admin: Annotated[User, Depends(get_current_active_admin)]
):
    col = db.get_collection("brand_attribute_banks")
    bank = await col.find_one({"is_global": True})
    if not bank:
        raise HTTPException(status_code=404, detail="Bank not found")
    
    attributes = bank.get("attributes", [])
    found = False
    for i, a in enumerate(attributes):
        if a["id"] == attr_id:
            attributes[i] = attr_update.model_dump()
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Attribute not found")
    
    await col.update_one(
        {"_id": bank["_id"]},
        {
            "$set": {
                "attributes": attributes,
                "updated_at": datetime.utcnow()
            }
        }
    )
    return await col.find_one({"_id": bank["_id"]})
