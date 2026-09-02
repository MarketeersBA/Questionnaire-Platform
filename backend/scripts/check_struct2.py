import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"}, sort=[("generated_at", -1)])
        if report:
            print(type(report.get("report_data")))
            if isinstance(report.get("report_data"), dict):
                pass
            elif isinstance(report.get("report_data"), list):
                for chart in report["report_data"]:
                    if chart.get("chart_id") == "key_preference_drivers":
                        data = chart.get("data", {})
                        print("main datasets:", len(data.get("main_scatter", {}).get("datasets", [])))
                        if len(data.get("main_scatter", {}).get("datasets", [])) > 0:
                            print("first pt:", data["main_scatter"]["datasets"][0]["data"][0])
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
