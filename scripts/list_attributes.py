import asyncio
from backend.database import db

async def list_attr():
    db.connect()
    col = db.get_collection('master_questions')
    attrs = await col.distinct('main_attribute')
    print("Main Attributes:")
    for a in attrs:
        print(f"- {a}")
        
    # Get sub-attributes for one sample (e.g., Appearance)
    sample = await col.find({"main_attribute": "Appearance"}).to_list(100)
    sub_attrs = set()
    for s in sample:
        for sub in s.get('sub_attributes', []):
            sub_attrs.add(sub)
    print("\nSub-Attributes for Appearance:")
    for sa in sorted(list(sub_attrs)):
        print(f"- {sa}")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(list_attr())
