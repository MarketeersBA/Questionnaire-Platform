import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "69f86a4564a3943cd07f8cc6"}, sort=[("generated_at", -1)])
        if report:
            data = report.get("report_data", {}).get("key_preference_drivers", {})
            for ds in data.get("main_scatter", {}).get("datasets", []):
                print(ds.get("brand"), "points:", len(ds.get("data", [])))
                if len(ds.get("data", [])) > 0:
                    print(ds.get("data")[0])
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
