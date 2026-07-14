from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = logging.getLogger(__name__)

class QuotaMonitor:
    """
    Monitors AI API quota status and triggers admin alerts.
    Acts as the early warning system for the Ecosystem Manager.
    """
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.alerts_collection = db["admin_alerts"]
    
    async def on_quota_exhausted(self, survey_id: str, error: Exception, 
                                   cost_summary: Dict[str, Any]) -> None:
        """
        Called when an API call fails due to quota/rate limits.
        1. Persist an alert to the admin_alerts collection.
        2. These alerts are highly visible to Ecosystem Managers.
        """
        alert = {
            "type": "ai_quota_exhausted",
            "severity": "critical",
            "survey_id": survey_id,
            "error_message": str(error),
            "cost_summary": cost_summary,    # Real-time token breakdown at failure point
            "timestamp": datetime.now(timezone.utc),
            "acknowledged": False,
            "resolved": False,
            "metadata": {
                "error_type": type(error).__name__,
                "source": "AIGuard"
            }
        }
        
        try:
            await self.alerts_collection.insert_one(alert)
            logger.critical("[QuotaMonitor] API Quota Hit for survey %s. Admin alert dispatched.", survey_id)
        except Exception as e:
            logger.error("[QuotaMonitor] Failed to persist admin alert: %s", e)
    
    async def get_active_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Admin-only: Get all unresolved alerts for the Ecosystem Manager."""
        cursor = self.alerts_collection.find({"resolved": False}).sort("timestamp", -1)
        alerts = await cursor.to_list(limit)
        for a in alerts:
            a["_id"] = str(a["_id"])
        return alerts
    
    async def acknowledge_alert(self, alert_id: str, admin_id: str) -> bool:
        """Mark an alert as acknowledged by an admin."""
        try:
            result = await self.alerts_collection.update_one(
                {"_id": ObjectId(alert_id)},
                {
                    "$set": {
                        "acknowledged": True,
                        "acknowledged_by": admin_id,
                        "acknowledged_at": datetime.now(timezone.utc)
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error("[QuotaMonitor] Acknowledge failed: %s", e)
            return False

    async def resolve_alert(self, alert_id: str, admin_id: str, comment: str = "") -> bool:
        """Close the alert loop once the quota/budget issue is addressed."""
        try:
            result = await self.alerts_collection.update_one(
                {"_id": ObjectId(alert_id)},
                {
                    "$set": {
                        "resolved": True,
                        "resolved_by": admin_id,
                        "resolved_at": datetime.now(timezone.utc),
                        "resolution_comment": comment
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error("[QuotaMonitor] Resolution failed: %s", e)
            return False
