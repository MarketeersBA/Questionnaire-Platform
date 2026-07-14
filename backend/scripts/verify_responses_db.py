import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client['survey_platform']
    survey_id = "6a3b8939b3fa5ef1308239ed"
    
    count = await db.responses.count_documents({"survey_id": survey_id})
    print(f"Responses for {survey_id}: {count}")
    
    # Check one document
    doc = await db.responses.find_one({"survey_id": survey_id})
    if doc:
        print("Sample Doc Structure:")
        print(f"survey_id: {doc.get('survey_id')} (Type: {type(doc.get('survey_id'))})")
        print(f"answers keys: {list(doc.get('answers', {}).keys())}")
        print(f"structured keys: {list(doc.get('answers', {}).get('__structured', {}).keys())}")
    else:
        print("NO DOCUMENTS FOUND")

if __name__ == "__main__":
    asyncio.run(check())
