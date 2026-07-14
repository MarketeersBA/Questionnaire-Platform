import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def find_all_reports():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["survey_platform"]
    
    survey_id = "69ce229eeed39ea9d5282afa"
    cursor = db.survey_reports.find({"survey_id": survey_id}).sort("generated_at", -1)
    
    reports = await cursor.to_list(length=100)
    print(f"Total reports found for survey {survey_id}: {len(reports)}")
    
    for r in reports:
        print(f"ID: {r['_id']} | Status: {r.get('status')} | PPTX Status: {r.get('pptx_status')} | Path: {r.get('pptx_path')} | Generated At: {r.get('generated_at')}")

if __name__ == "__main__":
    asyncio.run(find_all_reports())
