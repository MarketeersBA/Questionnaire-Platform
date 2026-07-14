import asyncio
from backend.database import db
from backend.config import settings

async def verify():
    print("Connecting to database...")
    db.connect()
    
    questions_col = db.get_collection("master_questions")
    count = await questions_col.count_documents({})
    print(f"Total questions in master_questions: {count}")
    
    if count == 200:
        print("✅ SUCCESS: Found all 200 questions.")
    else:
        print(f"❌ ERROR: Expected 200 questions, found {count}.")
        
    # Sample check
    sample = await questions_col.find_one({"question_id": "Q003"})
    if sample:
        print(f"Sample Q003 Text: {sample['question_text']}")
        print(f"Sample Q003 Options: {sample['options']}")
        if isinstance(sample['options'], list) and len(sample['options']) > 1:
            print("✅ SUCCESS: Options parsed as list.")
        else:
            print("❌ ERROR: Options NOT parsed as list.")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(verify())
