import motor.motor_asyncio
import asyncio
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DATABASE_NAME", "survey_platform")
    print(f"Connecting to {uri} / {db_name}")
    client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    db = client[db_name]
    col = db["brand_attribute_banks"]
    bank = await col.find_one({"is_global": True})
    print(f"Bank found: {bank is not None}")
    if bank:
        print(f"Name: {bank.get('name')}")
        print(f"Attrs count: {len(bank.get('attributes', []))}")
        for a in bank.get('attributes', []):
            print(f" - {a.get('id')}: {a.get('label_en')}")

if __name__ == "__main__":
    asyncio.run(run())
