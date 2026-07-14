import motor.motor_asyncio
import asyncio

async def inspect():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    
    print("--- Question Modules ---")
    modules = await db.question_modules.find().to_list(None)
    for m in modules:
        print(f"ID: {m.get('moduleId')} | Version: {m.get('version')} | Status: {m.get('status')}")

    print("\n--- Taste Test Questions ---")
    tt_count = await db.taste_test_questions.count_documents({})
    print(f"Total Taste Test Questions: {tt_count}")
    if tt_count > 0:
        sample = await db.taste_test_questions.find_one()
        print(f"Sample Question: {sample.get('text')}")

if __name__ == "__main__":
    asyncio.run(inspect())
