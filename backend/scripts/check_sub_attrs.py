import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        # Check attribute registry in report
        report = await db.get_collection("survey_reports").find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"}, sort=[("generated_at", -1)])
        if report and "attribute_registry" in report:
            print("Found in report attribute_registry:")
            for item in report["attribute_registry"]:
                print(f"Main: {item.get('main_att')}, Sub: {item.get('supp_att')}")
        else:
            # Check attribute banks collection
            banks = await db.get_collection("attribute_banks").find({}).to_list(length=None)
            print("Found in attribute_banks:")
            for bank in banks:
                print(f"Bank: {bank.get('name')}")
                for item in bank.get("attributes", []):
                    print(f"  Main: {item.get('main_att')}, Sub: {item.get('supp_att')}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
