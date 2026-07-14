
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    col = db.taste_test_questions
    
    pipeline = [
        {"$group": {"_id": "$question_status", "count": {"$sum": 1}}}
    ]
    results = await col.aggregate(pipeline).to_list(length=100)
    print("Question Status Distribution:")
    for r in results:
        print(f"  {r['_id']}: {r['count']}")
    
    # Also check timing
    pipeline2 = [
        {"$group": {"_id": "$timing", "count": {"$sum": 1}}}
    ]
    results2 = await col.aggregate(pipeline2).to_list(length=100)
    print("\nTiming Distribution:")
    for r in results2:
        print(f"  {r['_id']}: {r['count']}")

if __name__ == "__main__":
    asyncio.run(check())
