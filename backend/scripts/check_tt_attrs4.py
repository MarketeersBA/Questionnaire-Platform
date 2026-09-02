import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        report = await db.get_collection("survey_reports").find_one({"survey_id": "69f86a4564a3943cd07f8cc6"}, sort=[("generated_at", -1)])
        if report and "attribute_registry" in report:
            for item in report["attribute_registry"]:
                print(f"Main: {item.get('main_att')}, Sub: {item.get('supp_att')}")
        else:
            print("No attribute registry in report!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
