
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    count = await db.question_modules.count_documents({})
    print(f'Question modules count: {count}')
    
    m_count = await db.master_questions.count_documents({})
    print(f'Master questions count: {m_count}')
    
    tt_count = await db.taste_test_questions.count_documents({})
    print(f'Taste test questions count: {tt_count}')
    if count > 0:
        q = await db.question_modules.find_one({})
        print(f'Sample: {q}')
    
    # Also check the brand attributes
    bank_count = await db.brand_attribute_banks.count_documents({})
    print(f'Bank count: {bank_count}')

if __name__ == "__main__":
    asyncio.run(check())
