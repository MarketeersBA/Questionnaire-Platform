import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from bson import ObjectId

async def check_db():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["survey_platform"]
    
    print("--- Survey Reports ---")
    cursor = db.survey_reports.find({}).sort("generated_at", -1).limit(10)
    async for doc in cursor:
        print(f"Report _id: {doc['_id']}")
        print(f"  survey_id: {doc.get('survey_id')} (type: {type(doc.get('survey_id'))})")
        print(f"  status: {doc.get('status')}")
        print(f"  pptx_status: {doc.get('pptx_status')}")
        print(f"  pptx_path: {doc.get('pptx_path')}")
        print("-" * 20)

if __name__ == "__main__":
    asyncio.run(check_db())
