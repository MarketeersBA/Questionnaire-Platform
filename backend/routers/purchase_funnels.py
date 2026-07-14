from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Annotated
from datetime import datetime
from bson import ObjectId
from backend.models import PurchaseFunnel, PurchaseFunnelBrand, User
from backend.database import db
from backend.routers.auth import get_current_user, get_current_active_analyst
from pydantic import BaseModel

router = APIRouter(prefix="/purchase-funnels", tags=["purchase-funnels"])

class PurchaseFunnelCreate(BaseModel):
    survey_id: str
    category_name: str
    brand_list: List[PurchaseFunnelBrand]
    is_enabled: bool = True

@router.post("/", response_model=PurchaseFunnel)
async def create_purchase_funnel(
    funnel_in: PurchaseFunnelCreate,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    col = db.get_collection("purchase_funnels")
    
    # Check if a funnel already exists for this survey
    existing = await col.find_one({"survey_id": funnel_in.survey_id})
    if existing:
        raise HTTPException(status_code=400, detail="Purchase Funnel already exists for this survey")
        
    now = datetime.utcnow()
    funnel_dict = funnel_in.model_dump()
    funnel_dict.update({
        "created_by": current_user.username,
        "created_at": now,
        "updated_at": now
    })
    
    result = await col.insert_one(funnel_dict)
    created = await col.find_one({"_id": result.inserted_id})
    
    # Update the survey to reference this funnel
    surveys_col = db.get_collection("surveys")
    await surveys_col.update_one(
        {"_id": ObjectId(funnel_in.survey_id)},
        {"$set": {"purchase_funnel_id": str(created["_id"])}}
    )
    
    return created

@router.get("/survey/{survey_id}", response_model=PurchaseFunnel)
async def get_funnel_by_survey(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    col = db.get_collection("purchase_funnels")
    funnel = await col.find_one({"survey_id": survey_id})
    if not funnel:
        raise HTTPException(status_code=404, detail="Purchase Funnel not found for this survey")
    return funnel

@router.put("/{funnel_id}", response_model=PurchaseFunnel)
async def update_purchase_funnel(
    funnel_id: str,
    funnel_in: PurchaseFunnelCreate,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    if not ObjectId.is_valid(funnel_id):
        raise HTTPException(status_code=400, detail="Invalid funnel ID")
        
    col = db.get_collection("purchase_funnels")
    existing = await col.find_one({"_id": ObjectId(funnel_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Purchase Funnel not found")
        
    update_data = funnel_in.model_dump()
    update_data["updated_at"] = datetime.utcnow()
    
    await col.update_one(
        {"_id": ObjectId(funnel_id)},
        {"$set": update_data}
    )
    
    return await col.find_one({"_id": ObjectId(funnel_id)})
