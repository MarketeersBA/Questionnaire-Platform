from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from bson import ObjectId

from backend.database import db
from backend.models import User, UserUpdate
from backend.routers.auth import get_current_active_admin
from backend.utils.audit_utils import log_action

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[User])
async def list_users(
    admin: User = Depends(get_current_active_admin)
):
    """
    List all users in the system (Admin only).
    """
    users_col = db.get_collection("users")
    cursor = users_col.find({"is_deleted": {"$ne": True}})
    users = await cursor.to_list(length=100)
    return [User(**u) for u in users]

@router.put("/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    admin: User = Depends(get_current_active_admin)
):
    """
    Update a user's details or role (Admin only).
    """
    users_col = db.get_collection("users")
    
    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    
    result = await users_col.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": update_data},
        return_document=True
    )
    
    await log_action(
        user=admin,
        action="update_user",
        resource_type="users",
        resource_id=user_id,
        details={"updated_fields": list(update_data.keys())}
    )
        
    return User(**result)

@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(get_current_active_admin)
):
    """
    Soft-delete a user (Admin only).
    """
    users_col = db.get_collection("users")
    
    # Prevent admin from deleting themselves
    if str(admin.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot delete their own account"
        )
        
    result = await users_col.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"is_deleted": True}}
    )
    
    await log_action(
        user=admin,
        action="delete_user",
        resource_type="users",
        resource_id=user_id
    )
        
    return {"detail": "User deleted"}
