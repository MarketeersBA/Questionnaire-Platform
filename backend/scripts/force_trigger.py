import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from backend.services.analytics_service import analytics_service
from bson import ObjectId

async def main():
    db.connect()
    try:
        surveys_col = db.get_collection("surveys")
        surveys = await surveys_col.find({}).to_list(None)
        
        target_survey = next((s for s in surveys if "Hero Protein Bar Taste Test" in s.get('company_name', '')), None)
        if target_survey:
            survey_id = str(target_survey['_id'])
            print(f"Triggering analysis directly for {survey_id}...")
            
            # Use generation options to force re-running the god prompt
            options = {
                "force": True,
                "regenerate_ai": True,
                "recalculate_regression": True
            }
            
            print("Running analysis task...")
            await analytics_service._run_analysis_task(survey_id, options=options, force=True)
            print("Analysis Task Complete and saved to DB!")
        else:
            print("Target survey not found.")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
