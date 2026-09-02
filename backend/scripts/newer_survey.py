import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # Get a newer survey that has template_snapshot_l2
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a81c74cbc30cb63da735ed1")})
        if survey:
            # taste_test_config
            config = survey.get("taste_test_config", {})
            attr_seq = config.get("attribute_sequence", [])
            print("CHEESE TASTE TEST - attribute_sequence:")
            for attr in attr_seq:
                main = attr.get("main_attribute")
                subs = attr.get("sub_attributes", [])
                print(f"  Main: {main}  ->  Subs: {subs}")
            
            # template_snapshot_l2
            snapshot = survey.get("template_snapshot_l2", {})
            sections = snapshot.get("sections", [])
            print(f"\nTEMPLATE_SNAPSHOT_L2 sections: {len(sections)}")
            for sec in sections:
                title = sec.get("title", "Untitled")
                qs = sec.get("questions", [])
                print(f"\n--- Section: {title} ({len(qs)} questions) ---")
                for q in qs:
                    qtext = q.get("text", "")
                    qtype = q.get("type", "")
                    print(f"  [{qtype}] {qtext}")
                    for opt in q.get("options", []):
                        print(f"    - {opt.get('text', '')}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
