import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client['survey_platform']
    survey_id = "6a3b8939b3fa5ef1308239ed"
    
    report = await db.survey_reports.find_one({"survey_id": survey_id})
    if report:
        print(f"Report Status: {report.get('status')}")
        print(f"Chart Count: {len(report.get('charts', []))}")
        print(f"Base N: {report.get('base_n')}")
        print(f"Brands: {report.get('brands')}")
        
    survey = await db.surveys.find_one({"_id": AsyncIOMotorClient.BSON_ID(survey_id) if hasattr(AsyncIOMotorClient, "BSON_ID") else None}) # Wait, I'll just use manual find
    import bson
    survey = await db.surveys.find_one({"_id": bson.ObjectId(survey_id)})
    if survey:
        print(f"Survey Status: {survey.get('status')}")
        print(f"Report Status (Survey Doc): {survey.get('report_status')}")

if __name__ == "__main__":
    asyncio.run(check())
