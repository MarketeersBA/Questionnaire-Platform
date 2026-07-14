from datetime import datetime
from typing import Any, Dict, Optional
from backend.database import db
from backend.models import User
from backend.utils.logging_utils import logger

async def log_action(
    user: User,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Dict[str, Any] = None,
    client_ip: Optional[str] = None
):
    """
    Persist an administrative or analyst action to the audit_logs collection.
    """
    try:
        audit_col = db.get_collection("audit_logs")
        log_entry = {
            "action": action,
            "user_id": str(user.id),
            "username": user.username,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details or {},
            "client_ip": client_ip,
            "timestamp": datetime.utcnow()
        }
        await audit_col.insert_one(log_entry)
        logger.info(f"[AUDIT] {user.username} performed {action} on {resource_type}:{resource_id}")
    except Exception as e:
        logger.error(f"Failed to record audit log: {e}")
