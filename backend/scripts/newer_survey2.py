import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a81c74cbc30cb63da735ed1")})
        if survey:
            config = survey.get("taste_test_config", {})
            attr_seq = config.get("attribute_sequence", [])
            print("CHEESE TASTE TEST - attribute_sequence:")
            for attr in attr_seq:
                main = attr.get("main_attribute")
                subs = attr.get("sub_attributes", [])
                print(f"  Main: {main}  ->  Subs: {subs}")
            
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
                        if isinstance(opt, dict):
                            print(f"    - {opt.get('text', '')}")
                        else:
                            print(f"    - {opt}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
