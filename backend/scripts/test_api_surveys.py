import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from backend.routers.surveys import list_surveys
from backend.models import User
from bson import ObjectId

async def test_api():
    db.connect()
    try:
        # Mock user
        user = User(
            id=ObjectId("000000000000000000000001"),
            username="admin",
            role="admin",
            is_active=True,
            hashed_password="---"
        )
        
        print("Calling list_surveys API mock...")
        surveys = await list_surveys(current_user=user)
        print(f"Success! Found {len(surveys)} surveys.")
        for s in surveys:
            print(f"- {s.company_name} ({s.survey_code})")
    except Exception as e:
        print(f"API CALL FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_api())
