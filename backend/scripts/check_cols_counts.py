import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client['survey_platform']
    cols = await db.list_collection_names()
    print("Collections:", cols)
    
    for col in ["responses", "survey_responses"]:
        if col in cols:
            count = await db[col].count_documents({})
            print(f"Collection {col} count: {count}")

if __name__ == "__main__":
    asyncio.run(check())
