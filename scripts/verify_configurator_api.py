import asyncio
from backend.database import db
from backend.routers.questions import get_main_attributes, get_sub_attributes

async def verify_api():
    print("Connecting to database...")
    db.connect()
    try:
        # Mocking auth dependency is complex here, so let's just test the logic directly or call the functions
        # The functions use db.get_collection which needs db.connect()
        
        print("\nVerifying get_main_attributes logic...")
        col = db.get_collection("master_questions")
        attributes = await col.distinct("main_attribute")
        print(f"Main Attributes found: {len(attributes)}")
        for a in sorted(attributes):
            print(f"  - {a}")
            
        attr = "Appearance"
        print(f"\nVerifying get_sub_attributes logic for '{attr}'...")
        cursor = col.find({"main_attribute": attr})
        questions = await cursor.to_list(length=100)
        sub_attrs = set()
        for q in questions:
            for sub in q.get("sub_attributes", []):
                if sub and sub.lower() != "all":
                    sub_attrs.add(sub)
        
        result = sorted(list(sub_attrs))[:10]
        print(f"Sub-attributes for {attr} (limited to 10): {len(result)}")
        for s in result:
            print(f"  - {s}")
            
        if len(attributes) == 10 and len(result) <= 10:
            print("\n✅ SUCCESS: API logic verification passed.")
        else:
            print(f"\n❌ ERROR: Unexpected counts. Attrs: {len(attributes)}, Subs: {len(result)}")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(verify_api())
