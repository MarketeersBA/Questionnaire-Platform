import asyncio
import traceback
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from backend.analytics_module.pptx_facade import PPTXGenerator

async def test_pptx():
    try:
        client = AsyncIOMotorClient('mongodb://mongodb:27017')
        db = client.survey_platform
        survey_id = "69ce229eeed39ea9d5282afa"
        
        doc = await db.survey_reports.find_one({"survey_id": survey_id})
        if not doc:
            print(f"No report found for {survey_id}")
            return
            
        print(f"Found report. Charts count: {len(doc.get('charts', []))}")
        
        generator = PPTXGenerator(db, survey_id)
        path = await generator.generate_from_report(doc)
        print(f"SUCCESS. Path: {path}")
    except Exception as e:
        print(f"ERROR OCCURRED:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_pptx())
