import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def update_db():
    client = AsyncIOMotorClient('mongodb://mongodb:27017')
    db = client.survey_platform
    survey_id = "69ce229eeed39ea9d5282afa"
    
    path = "/app/backend/reports/Report_69ce229eeed39ea9d5282afa_20260422_143610_protein_bar__.pptx"
    await db.survey_reports.update_one({"survey_id": survey_id}, {"$set": {"pptx_path": path}})
    print("Database Updated Successfully!")

if __name__ == "__main__":
    asyncio.run(update_db())
