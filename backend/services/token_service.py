from datetime import datetime
from typing import Optional
from fastapi import HTTPException, status
from backend.database import db
from backend.models import Token

class TokenService:
    ALLOWED_TRANSITIONS = {
        "unused": ["passed", "failed", "unused"],
        "passed": ["submitted", "passed"],
        "failed": ["failed"],
        "submitted": ["submitted"]
    }

    @staticmethod
    async def get_token_by_string(token_str: str) -> Optional[dict]:
        tokens_col = db.get_collection("tokens")
        return await tokens_col.find_one({"token": token_str})

    @staticmethod
    async def update_token_status(token_str: str, new_status: str) -> bool:
        """
        Atomically updates the token status using find_one_and_update with a status guard.
        """
        tokens_col = db.get_collection("tokens")
        
        # 1. Get current token to check allowed transition
        token_doc = await tokens_col.find_one({"token": token_str})
        if not token_doc:
            raise HTTPException(status_code=404, detail="Token not found")
        
        current_status = token_doc.get("status", "unused")
        
        # 2. Validate transition
        allowed = TokenService.ALLOWED_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition: {current_status} -> {new_status}"
            )

        # 3. Atomic update with status guard
        result = await tokens_col.find_one_and_update(
            {"token": token_str, "status": current_status},
            {
                "$set": {
                    "status": new_status,
                    "last_accessed": datetime.utcnow()
                }
            },
            return_document=True
        )
        
        if not result:
            # This happens if status changed between step 1 and 3 (race condition)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="State transition failed due to concurrent update"
            )
            
        return True

    @staticmethod
    async def record_access(token_str: str):
        """Atomically updates the last_accessed timestamp."""
        tokens_col = db.get_collection("tokens")
        await tokens_col.update_one(
            {"token": token_str},
            {"$set": {"last_accessed": datetime.utcnow()}}
        )

token_service = TokenService()
