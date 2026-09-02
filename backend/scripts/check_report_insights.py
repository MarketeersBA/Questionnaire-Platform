import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if report:
            print("Insights count:", len(report.get("insights", {})))
            print("First few insights keys:", list(report.get("insights", {}).keys())[:3])
            
            # Print sections
            print("Sections:", [s.get('id') for s in report.get("sections", [])])
            
            # Print charts counts per section
            charts = report.get("charts", [])
            for s in report.get("sections", []):
                s_id = s.get('id')
                count = sum(1 for c in charts if c.get('section') == s_id)
                print(f"Section {s_id} has {count} charts")
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
