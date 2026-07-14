import motor.motor_asyncio
import asyncio

async def list_collections():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    collections = await db.list_collection_names()
    print("Collections:", collections)
    
    # Check modules collection
    if 'modules' in collections:
        modules = await db.modules.find().to_list(None)
        print(f"Modules found: {[m['moduleId'] for m in modules if 'moduleId' in m]}")
    else:
        print("Modules collection NOT found")

if __name__ == "__main__":
    asyncio.run(list_collections())
