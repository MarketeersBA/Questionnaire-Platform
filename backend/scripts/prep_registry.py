import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client['survey_platform']
    
    # 1. Find a Taste Test Template
    template = await db.templates.find_one({"type": "taste_test", "is_deleted": {"$ne": True}})
    if not template:
        template = await db.templates.find_one({"is_deleted": {"$ne": True}})
        
    print(f"Template ID: {str(template['_id']) if template else 'NONE'}")
    
    # 2. Find any user to set as created_by
    user = await db.users.find_one({"role": "admin"})
    if not user:
        user = await db.users.find_one()
    print(f"User: {user['username'] if user else 'admin'}")

if __name__ == "__main__":
    asyncio.run(check())
