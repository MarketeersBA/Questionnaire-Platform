import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        # Let's also check product_test_configs
        pt_config = await db.get_collection("product_test_configs").find_one({"survey_id": "69f86a4564a3943cd07f8cc6"})
        if pt_config:
            print("\nProduct Test Attributes Selected:")
            print("Main Attributes:")
            for attr in pt_config.get("main_attributes", []):
                print(f" - {attr.get('en_text')} (ar: {attr.get('ar_text')})")
            
            print("\nSub Attributes:")
            for attr in pt_config.get("sub_attributes", []):
                print(f" - {attr.get('en_text')} (ar: {attr.get('ar_text')})")
        else:
            print("No pt_config found")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
