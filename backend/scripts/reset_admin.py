
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

# Load .env
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") # Use the local .env URI
DATABASE_NAME = os.getenv("DATABASE_NAME", "survey_platform")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def reset_admin():
    print(f"Connecting to {MONGO_URI}...")
    # NOTE: Since this is local, if MONGO_URI in .env is "mongodb://localhost:27018", it works.
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DATABASE_NAME]
    users_col = db.get_collection("users")
    
    hashed_pw = pwd_context.hash(ADMIN_PASSWORD)
    
    print(f"Updating user '{ADMIN_USERNAME}' with password '{ADMIN_PASSWORD}'...")
    result = await users_col.update_one(
        {"username": ADMIN_USERNAME},
        {"$set": {
            "hashed_password": hashed_pw,
            "role": "admin",
            "is_active": True
        }},
        upsert=True
    )
    
    if result.matched_count > 0:
        print(f"Successfully updated password for {ADMIN_USERNAME}")
    else:
        print(f"Created new admin user: {ADMIN_USERNAME}")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_admin())
