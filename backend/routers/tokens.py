from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Annotated, Optional
from bson import ObjectId
import uuid
from datetime import datetime, timedelta
from backend.models import Token, TokenCreate, User, TokenBulkUpdate
from backend.database import db
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/tokens", tags=["tokens"])

@router.post("/generate", response_model=List[str])
async def generate_tokens(
    token_request: TokenCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(token_request.survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
        
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(token_request.survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
        
    generated_tokens = []
    token_documents = []
    batch_id = str(uuid.uuid4())[:8] # Short batch ID for readability
    
    # Default expiry 30 days if not specified
    expires_at = datetime.utcnow() + timedelta(days=30)
    
    for _ in range(token_request.count):
        token_str = str(uuid.uuid4())
        generated_tokens.append(token_str)
        
        token_doc = {
            "survey_id": token_request.survey_id,
            "token": token_str,
            "status": "unused",
            "batch_id": batch_id,
            "created_by": current_user.username,
            "created_at": datetime.utcnow(),
            "expires_at": expires_at,
            "last_accessed": None
        }
        token_documents.append(token_doc)
        
    if token_documents:
        await db.get_collection("tokens").insert_many(token_documents)
        
    return generated_tokens

@router.get("/survey/{survey_id}/summary")
async def get_token_summary(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
        
    pipeline = [
        {"$match": {"survey_id": survey_id}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        }
    ]
    
    results = await db.get_collection("tokens").aggregate(pipeline).to_list(100)
    
    # Format counts: {unused: X, passed: Y, ...}
    summary = {
        "unused": 0,
        "passed": 0,
        "failed": 0,
        "submitted": 0,
        "total": 0
    }
    
    for item in results:
        status_val = item["_id"]
        count = item["count"]
        if status_val in summary:
            summary[status_val] = count
            summary["total"] += count
            
    return summary

@router.get("/survey/{survey_id}")
async def list_tokens_by_survey(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
        
    query = {"survey_id": survey_id}
    if status:
        query["status"] = status
    if batch_id:
        query["batch_id"] = batch_id
        
    skip = (page - 1) * page_size
    
    tokens_cursor = db.get_collection("tokens").find(query).sort("created_at", -1).skip(skip).limit(page_size)
    tokens_list = await tokens_cursor.to_list(page_size)
    
    # Convert ObjectIds and datetimes to strings
    for t in tokens_list:
        if "_id" in t:
            t["_id"] = str(t["_id"])
        for dt_field in ["created_at", "expires_at", "last_accessed"]:
            if t.get(dt_field) and isinstance(t[dt_field], datetime):
                t[dt_field] = t[dt_field].isoformat()
    
    total = await db.get_collection("tokens").count_documents(query)
    
    return {
        "items": tokens_list,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("/bulk-update")
async def bulk_update_tokens(
    update_data: TokenBulkUpdate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not update_data.token_ids:
        return {"status": "success", "modified_count": 0}
        
    update_fields = {}
    if update_data.status:
        update_fields["status"] = update_data.status
    if update_data.expires_at:
        update_fields["expires_at"] = update_data.expires_at
        
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update")
        
    result = await db.get_collection("tokens").update_many(
        {"_id": {"$in": [ObjectId(tid) for tid in update_data.token_ids]}},
        {"$set": update_fields}
    )
    
    return {
        "status": "success",
        "modified_count": result.modified_count
    }
