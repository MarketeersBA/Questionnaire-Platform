
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def check_users():
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("DATABASE_NAME", "survey_platform")
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    users_col = db["users"]
    count = await users_col.count_documents({})
    print(f"Total users: {count}")
    async for user in users_col.find():
        print(f"User: {user.get('username')}, Active: {user.get('is_active')}")
    client.close()

if __name__ == "__main__":
    asyncio.run(check_users())
