
import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    cursor = db.question_modules.find({})
    async for doc in cursor:
        doc['_id'] = str(doc['_id'])
        # Print with encoding safety
        print(json.dumps(doc, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(check())
