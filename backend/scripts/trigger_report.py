import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from backend.services.analytics_service import analytics_service
from fastapi import BackgroundTasks
from bson import ObjectId
import os

async def trigger():
    # Initialize DB (uses settings.MONGO_URI automatically)
    db.connect()
    
    survey_id = "6a3b8939b3fa5ef1308239ed"
    bg_tasks = BackgroundTasks()
    
    print(f"Triggering report for {survey_id}...")
    
    class UserMock:
        def __init__(self):
            self.id = ObjectId("000000000000000000000001")
            self.username = "admin"
            self.role = "admin"
            
    user = UserMock()
    
    try:
        res = await analytics_service.generate_survey_report(
            survey_id=survey_id,
            background_tasks=bg_tasks,
            current_user=user,
            force=True
        )
        print("Result:", res)
        
        print("Running analysis task...")
        await analytics_service._run_analysis_task(survey_id, options={}, force=True)
        print("Analysis Task Complete!")
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(trigger())
