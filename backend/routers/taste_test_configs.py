from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Annotated
from datetime import datetime
import uuid
from backend.models import TasteTestConfig, TasteTestConfigCreate, User
from backend.database import db
from backend.routers.auth import get_current_user, get_current_active_analyst

router = APIRouter(prefix="/taste-test-configs", tags=["taste-test-configs"])

@router.post("/", response_model=TasteTestConfig)
async def create_config(
    config_in: TasteTestConfigCreate,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    configs_col = db.get_collection("taste_test_configs")
    
    now = datetime.utcnow()
    config_dict = config_in.model_dump()
    
    # Initialize stable IDs if not provided
    if not config_dict.get("config_id"):
        config_dict["config_id"] = str(uuid.uuid4())
    if not config_dict.get("family_id"):
        config_dict["family_id"] = str(uuid.uuid4())
        
    config_dict["version"] = 1
    config_dict["created_by"] = current_user.username
    config_dict["created_at"] = now
    config_dict["status"] = "draft"
    
    result = await configs_col.insert_one(config_dict)
    created = await configs_col.find_one({"_id": result.inserted_id})
    return created

@router.get("/", response_model=List[TasteTestConfig])
async def list_latest_configs(
    current_user: Annotated[User, Depends(get_current_user)]
):
    configs_col = db.get_collection("taste_test_configs")
    
    # Aggregation to get the latest version of each family for this user
    pipeline = [
        {"$match": {"created_by": current_user.username}},
        {"$sort": {"version": -1}},
        {
            "$group": {
                "_id": "$family_id",
                "latest": {"$first": "$$ROOT"}
            }
        },
        {"$replaceRoot": {"newRoot": "$latest"}}
    ]
    
    cursor = configs_col.aggregate(pipeline)
    configs = await cursor.to_list(length=100)
    return configs

@router.get("/{config_id}", response_model=TasteTestConfig)
async def get_config(
    config_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    configs_col = db.get_collection("taste_test_configs")
    # Try to find the latest version for this config_id slug
    config = await configs_col.find_one(
        {"config_id": config_id, "created_by": current_user.username},
        sort=[("version", -1)]
    )
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return config

@router.put("/{config_id}", response_model=TasteTestConfig)
async def update_config(
    config_id: str,
    config_in: TasteTestConfigCreate,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    configs_col = db.get_collection("taste_test_configs")
    
    # Find the current latest to increment version
    latest = await configs_col.find_one(
        {"config_id": config_id, "created_by": current_user.username},
        sort=[("version", -1)]
    )
    
    if not latest:
        raise HTTPException(status_code=404, detail="Configuration not found")
        
    if latest["status"] == "locked":
        raise HTTPException(status_code=403, detail="Configuration is locked and cannot be edited")

    new_version = latest["version"] + 1
    config_dict = config_in.model_dump()
    
    # Preserve stable IDs
    config_dict["config_id"] = latest["config_id"]
    config_dict["family_id"] = latest["family_id"]
    config_dict["version"] = new_version
    config_dict["created_by"] = current_user.username
    config_dict["created_at"] = datetime.utcnow()
    
    result = await configs_col.insert_one(config_dict)
    updated = await configs_col.find_one({"_id": result.inserted_id})
    return updated

@router.delete("/{family_id}")
async def delete_config_family(
    family_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    configs_col = db.get_collection("taste_test_configs")
    result = await configs_col.delete_many(
        {"family_id": family_id, "created_by": current_user.username}
    )
    return {"status": "success", "deleted_count": result.deleted_count}
