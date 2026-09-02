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
            charts = report.get("charts", [])
            for c in charts:
                if c.get("chart_id") == "key_preference_drivers":
                    data = c.get("data", {})
                    datasets = data.get("main_scatter", {}).get("datasets", [])
                    print(f"Datasets count: {len(datasets)}")
                    if datasets:
                        print(f"First dataset keys: {datasets[0].keys()}")
                        print(f"First dataset data length: {len(datasets[0].get('data', []))}")
                        if datasets[0].get("data"):
                            print(f"First data point: {datasets[0]['data'][0]}")
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
