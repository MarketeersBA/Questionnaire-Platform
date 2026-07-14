import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27018/survey_platform")
    db = client.survey_platform
    pt_col = db.get_collection("product_test_questions")
    docs = await pt_col.find({}).to_list(100)
    print("Total PTs", len(docs))
    fixed = [d for d in docs if d.get('question_status') == 'fixed']
    print("Fixed count", len(fixed))

asyncio.run(run())
