import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def check_db():
    mongo_uri = os.getenv("MONGO_URI", "mongodb://admin:admin123@mongodb:27017")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_database("questioner")
    bank = await db.get_collection("brand_attribute_banks").find_one({"is_global": True})
    if bank:
        print(f"Bank Found: {bank.get('name')}")
        print(f"Attributes Count: {len(bank.get('attributes', []))}")
        for attr in bank.get('attributes', []):
            print(f" - {attr['id']}: {attr['label_en']}")
    else:
        print("No global bank found in brand_attribute_banks collection.")
    client.close()

if __name__ == "__main__":
    asyncio.run(check_db())
