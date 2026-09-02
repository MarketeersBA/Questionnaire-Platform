import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a3b8939b3fa5ef1308239ed")})
        if survey:
            config = survey.get("taste_test_config") or {}
            attr_seq = config.get("attribute_sequence", [])
            print("Taste test config attributes:")
            for attr in attr_seq:
                print(attr)
        else:
            print("Survey not found")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
