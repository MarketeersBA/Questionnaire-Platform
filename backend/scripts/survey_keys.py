import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a3b8939b3fa5ef1308239ed")})
        if not survey:
            print("Survey not found!")
            return
        
        # Print ALL top-level keys
        print("ALL SURVEY KEYS:")
        for k in sorted(survey.keys()):
            val = survey[k]
            vtype = type(val).__name__
            if isinstance(val, list):
                print(f"  {k}: list[{len(val)}]")
            elif isinstance(val, dict):
                print(f"  {k}: dict[{len(val)} keys]")
            elif isinstance(val, str) and len(val) > 100:
                print(f"  {k}: str({len(val)} chars)")
            else:
                print(f"  {k}: {vtype} = {val}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
