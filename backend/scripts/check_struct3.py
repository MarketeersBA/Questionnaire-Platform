import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"}, sort=[("generated_at", -1)])
        if report:
            print("Keys:", report.keys())
            if "sections" in report:
                for sec in report["sections"]:
                    for chart in sec.get("charts", []):
                        if chart.get("chart_id") == "key_preference_drivers":
                            print("FOUND KPD CHART!")
                            data = chart.get("data", {})
                            print("main datasets:", len(data.get("main_scatter", {}).get("datasets", [])))
                            if len(data.get("main_scatter", {}).get("datasets", [])) > 0:
                                print("first pt:", data["main_scatter"]["datasets"][0]["data"][0])
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
