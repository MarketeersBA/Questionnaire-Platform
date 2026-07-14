import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

# Add working directory to sys.path to find backend
sys.path.append(os.getcwd())

from backend.config import settings

async def check_db():
    print(f"Connecting to {settings.MONGO_URI}...")
    client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command('ping')
        print("MongoDB is reachable!")
        db = client[settings.DATABASE_NAME]
        collections = await db.list_collection_names()
        print(f"Collections in {settings.DATABASE_NAME}: {collections}")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
