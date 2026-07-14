import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def check_report_charts():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["survey_platform"]
    
    survey_id = "69ce229eeed39ea9d5282afa"
    report = await db.survey_reports.find_one({"survey_id": survey_id}, sort=[("generated_at", -1)])
    
    if not report:
        print(f"Report for survey {survey_id} not found")
        return
    
    print(f"Report found: {report.get('_id')} | Status: {report.get('status')}")
    print(f"PPTX Status: {report.get('pptx_status')} | Path: {report.get('pptx_path')}")

if __name__ == "__main__":
    asyncio.run(check_report_charts())
