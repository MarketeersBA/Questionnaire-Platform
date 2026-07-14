import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client['survey_platform']
    
    print("--- Collection: surveys ---")
    surveys = await db.surveys.find().to_list(length=5)
    for s in surveys:
        print(f"ID: {s.get('survey_id')} | Title: {s.get('title')} | Created: {s.get('created_at')}")

    print("\n--- Collection: survey_metadata ---")
    meta = await db.survey_metadata.find_one({"survey_id": "hero_protein_bar_legacy"})
    print(f"Hero Meta: {meta['survey_id'] if meta else 'NOT FOUND'}")

if __name__ == "__main__":
    asyncio.run(check())
