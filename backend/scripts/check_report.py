import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if report:
            print("Status:", report.get("status"))
            print("Charts count:", len(report.get("charts", [])) if "charts" in report else "No charts key")
            print("AI Insights count:", len(report.get("ai_insights", {})) if "ai_insights" in report else "No ai_insights key")
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
