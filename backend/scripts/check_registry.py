import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("surveys")
        survey = await col.find_one({"_id": db.ObjectId("6a3b8939b3fa5ef1308239ed")})
        if survey:
            registry = survey.get("taste_test_config", {}).get("attribute_sequence", [])
            for r in registry[:10]:
                print(r.get("main_att"), "->", r.get("supp_att"))
        else:
            print("No survey found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
