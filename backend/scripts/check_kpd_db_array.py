import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "69f86a4564a3943cd07f8cc6"}, sort=[("generated_at", -1)])
        if report:
            for chart in report.get("report_data", []):
                if chart.get("chart_id") == "key_preference_drivers":
                    print("Found chart data")
                    data = chart.get("data", {})
                    print("main_scatter:", len(data.get("main_scatter", {}).get("datasets", [])))
                    print("sub_scatter:", len(data.get("sub_scatter", {}).get("datasets", [])))
                    if len(data.get("main_scatter", {}).get("datasets", [])) > 0:
                        print("sample:", data["main_scatter"]["datasets"][0]["data"][0])
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
