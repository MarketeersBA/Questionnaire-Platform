import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from backend.models import Survey, User
from bson import ObjectId

async def test_validation():
    db.connect()
    try:
        surveys_col = db.get_collection("surveys")
        surveys_cursor = surveys_col.find({"is_deleted": {"$ne": True}})
        surveys_list = await surveys_cursor.to_list(1000)
        
        print(f"Validating {len(surveys_list)} surveys...")
        valid_count = 0
        for s in surveys_list:
            try:
                # This is what FastAPI does during serialization
                # Convert _id to id or handle it
                s['id'] = s['_id']
                Survey(**s)
                valid_count += 1
            except Exception as e:
                print(f"Validation failed for survey {s.get('company_name')} ({s.get('survey_code')}): {e}")
        
        print(f"Validation summary: {valid_count}/{len(surveys_list)} valid.")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_validation())
