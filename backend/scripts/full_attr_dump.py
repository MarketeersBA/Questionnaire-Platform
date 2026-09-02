import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # 1. Get ALL attribute banks (the master library)
        banks = await db.get_collection("attribute_banks").find({}).to_list(length=None)
        print("=" * 80)
        print("ATTRIBUTE BANKS (Master Library)")
        print("=" * 80)
        for bank in banks:
            print(f"\nCategory: {bank.get('category')} | Display: {bank.get('display_name')}")
            print("  CORE (Main) Attributes:")
            for attr in bank.get("core_attributes", []):
                print(f"    - {attr.get('label')} (id: {attr.get('attribute_id')}, scale: {attr.get('scale_type')})")
            print("  SUB Attributes:")
            for attr in bank.get("sub_attributes", []):
                print(f"    - {attr.get('label')} (id: {attr.get('attribute_id')}, scale: {attr.get('scale_type')})")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
