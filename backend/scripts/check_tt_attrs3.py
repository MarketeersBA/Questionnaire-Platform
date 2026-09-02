import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": "6a3b8939b3fa5ef1308239ed"})
        if survey:
            for mod in survey.get("modules", []):
                if mod.get("type") in ["taste_test", "product_test"]:
                    print(f"Module: {mod.get('type')}")
                    print(mod.keys())
                    if "config" in mod:
                        print("Config keys:", mod["config"].keys())
                        if "attributes" in mod["config"]:
                            print("Attributes:")
                            for a in mod["config"]["attributes"]:
                                print(a)
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
