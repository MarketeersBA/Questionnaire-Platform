import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": "6a3b8939b3fa5ef1308239ed"})
        
        # Let's check taste_test_configs
        tt_config = await db.get_collection("taste_test_configs").find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if tt_config:
            print("Taste Test Attributes Selected:")
            for attr in tt_config.get("attributes", []):
                print(attr)
        else:
            print("No tt_config found for 6a3b8939b3fa5ef1308239ed")

        # Let's also check product_test_configs
        pt_config = await db.get_collection("product_test_configs").find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if pt_config:
            print("\nProduct Test Attributes Selected:")
            print("Main Attributes:")
            for attr in pt_config.get("main_attributes", []):
                print(f" - {attr.get('en_text')} (ar: {attr.get('ar_text')})")
            
            print("\nSub Attributes:")
            for attr in pt_config.get("sub_attributes", []):
                print(f" - {attr.get('en_text')} (ar: {attr.get('ar_text')})")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
