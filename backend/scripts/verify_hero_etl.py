import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((msg + "\n").encode('utf-8'))

async def verify():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["survey_platform"]
    
    # 1. Total Responses
    count = await db.survey_responses.count_documents({"survey_id": "hero_protein_bar_legacy"})
    safe_print(f"Total Hero Respondents: {count}")
    
    # 2. Metadata check
    meta = await db.survey_metadata.find_one({"survey_id": "hero_protein_bar_legacy"})
    if meta:
        safe_print(f"Metadata Found: {meta['title']}")
        safe_print(f"Target Brand: {meta['target_brand']}")
    
    # 3. Aggregation check (Brand counts)
    pipeline = [
        {"$match": {"survey_id": "hero_protein_bar_legacy"}},
        {"$unwind": "$taste_test.rotations"},
        {"$group": {"_id": "$taste_test.rotations.brand", "count": {"$sum": 1}, "avg_likeness": {"$avg": "$taste_test.rotations.scores.Overall Likeness"}}}
    ]
    results = await db.survey_responses.aggregate(pipeline).to_list(length=10)
    safe_print("\nBrand Aggregations:")
    for res in results:
        safe_print(f"- {res['_id']}: {res['count']} evaluations, Avg Likeness: {res.get('avg_likeness', 0):.2f}")

    # 4. Check Essence calculation
    sample = await db.survey_responses.find_one({
        "survey_id": "hero_protein_bar_legacy",
        "taste_test.rotations.scores.Essence": {"$exists": True}
    })
    if sample:
        # Find the rotation with Essence
        rot = next(r for r in sample['taste_test']['rotations'] if 'Essence' in r['scores'])
        safe_print(f"\nSample Essence check (Respondent {sample['respondent_id']}):")
        safe_print(f"Brand: {rot['brand']}")
        safe_print(f"Innercolor: {rot['scores'].get('Innercolor')}")
        safe_print(f"Natural Inside: {rot['scores'].get('Natural Inside')}")
        safe_print(f"Essence: {rot['scores'].get('Essence')}")

if __name__ == "__main__":
    asyncio.run(verify())
