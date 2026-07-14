import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys

# Add working directory to sys.path to find backend
sys.path.append(os.getcwd())

from backend.config import settings

async def dump():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.DATABASE_NAME]
    
    # 1. Inspect 'Standard' template
    template = await db['templates'].find_one({'name': 'Standard'})
    print("\n--- STANDARD TEMPLATE ---")
    if template:
        # Remove ID for cleaner print if needed, but let's keep it
        print(json.dumps(template, indent=2, default=str))
    else:
        print("Standard template not found")

    # 2. Inspect latest surveys
    print("\n--- LATEST SURVEYS ---")
    surveys = await db['surveys'].find().sort('created_at', -1).to_list(10)
    for s in surveys:
        print(f"ID: {s['_id']} | Company: {s.get('company_name')} | Status: {s.get('status')}")
        print(f"  Tokens: {len(s.get('generated_tokens', []))} tokens stored")
        print(f"  Snapshot Qs: {len(s.get('template_snapshot_questions', []))} questions")
        print(f"  Link Count (requested): {s.get('link_count')}")
        print("---")

    client.close()

if __name__ == "__main__":
    asyncio.run(dump())
