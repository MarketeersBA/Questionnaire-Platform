import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
import json

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "69f86a4564a3943cd07f8cc6"}, sort=[("generated_at", -1)])
        if report:
            data = report.get("report_data", {}).get("key_preference_drivers", {})
            print("main_scatter datasets:", len(data.get("main_scatter", {}).get("datasets", [])))
            for ds in data.get("main_scatter", {}).get("datasets", []):
                print(ds.get("brand"), ds.get("data")[:2])
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
