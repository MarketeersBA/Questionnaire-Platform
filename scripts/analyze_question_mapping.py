import asyncio
from backend.database import db

async def analyze():
    db.connect()
    col = db.get_collection('master_questions')
    
    # Get all questions
    questions = await col.find({}).to_list(None)
    
    print(f"Total Questions: {len(questions)}")
    
    # Check mapping
    mapping = {}
    for q in questions:
        main = q.get('main_attribute')
        subs = q.get('sub_attributes', [])
        for sub in subs:
            key = (main, sub)
            if key not in mapping:
                mapping[key] = []
            mapping[key].append(q.get('question_text'))
            
    print("\nSample Mappings (Main -> Sub -> Questions Count):")
    for key, q_texts in list(mapping.items())[:10]:
        print(f"{key[0]} -> {key[1]}: {len(q_texts)} questions")
        
    db.close()

if __name__ == "__main__":
    asyncio.run(analyze())
