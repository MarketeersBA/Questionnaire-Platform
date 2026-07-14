import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def main():
    mongo_uri = "mongodb://localhost:27018" 
    client = AsyncIOMotorClient(mongo_uri)
    db = client["survey_platform"] 
    
    print("--- Surveys Collection Status ---")
    async for survey in db.surveys.find({}, {"company_name": 1, "report_status": 1, "respondent_count": 1, "respondent_target": 1}):
        print(f"ID: {survey['_id']} | Name: {survey.get('company_name')} | Status: {survey.get('report_status')} | Count: {survey.get('respondent_count')}/{survey.get('respondent_target')}")
    
    print("\n--- Survey Reports Collection ---")
    async for report in db.survey_reports.find({}):
        print(f"SurveyID: {report.get('survey_id')} | Status: {report.get('status')} | Error: {report.get('error_message')}")

if __name__ == "__main__":
    asyncio.run(main())
