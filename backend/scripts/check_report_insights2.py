import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
import json

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if report:
            insights = report.get("insights", {})
            print("Summary length:", len(insights.get("executive_summary", "")))
            print("Findings length:", len(insights.get("key_findings", [])))
            print("SWOT length:", len(insights.get("brand_swot", {})))
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
