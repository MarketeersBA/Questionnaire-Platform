import motor.motor_asyncio
import asyncio
from bson import json_util

async def inspect():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    
    print("--- Question Modules (Full First Doc) ---")
    module = await db.question_modules.find_one()
    if module:
        print(json_util.dumps(module, indent=2))
    else:
        print("No question modules found.")

    print("\n--- Brand Attribute Banks (Sample) ---")
    bank = await db.brand_attribute_banks.find_one()
    if bank:
        print(json_util.dumps(bank, indent=2))

if __name__ == "__main__":
    asyncio.run(inspect())
