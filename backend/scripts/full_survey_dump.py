import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a3b8939b3fa5ef1308239ed")})
        if not survey:
            print("Survey not found!")
            return
        
        # 1. Show taste_test_config (main/sub mapping for THIS survey)
        config = survey.get("taste_test_config") or {}
        attr_seq = config.get("attribute_sequence", [])
        print("=" * 80)
        print("THIS SURVEY's TASTE TEST CONFIG (attribute_sequence)")
        print("=" * 80)
        for attr in attr_seq:
            main = attr.get("main_attribute")
            subs = attr.get("sub_attributes", [])
            print(f"  Main: {main}  ->  Subs: {subs}")

        # 2. Show template_snapshot_l2 sections + questions  
        snapshot = survey.get("template_snapshot_l2", {})
        sections = snapshot.get("sections", [])
        print("\n" + "=" * 80)
        print("TEMPLATE SNAPSHOT L2 SECTIONS (survey questions)")
        print("=" * 80)
        for sec in sections:
            title = sec.get("title", "Untitled")
            print(f"\n--- Section: {title} ---")
            for q in sec.get("questions", []):
                qtext = q.get("text", "")
                qtype = q.get("type", "")
                qid = q.get("_id", "")
                print(f"  [{qtype}] Q: {qtext}")
                opts = q.get("options", [])
                if opts:
                    for opt in opts:
                        print(f"       - {opt.get('text', '')}")
                        
        # 3. Check modules field
        modules = survey.get("modules", [])
        print("\n" + "=" * 80)
        print("MODULES FIELD")
        print("=" * 80)
        for mod in modules:
            print(f"  type: {mod.get('type')}, enabled: {mod.get('enabled')}")
            
        # 4. Check purchase_funnel_config
        pf = survey.get("purchase_funnel_config", {})
        print("\n" + "=" * 80)
        print("PURCHASE FUNNEL CONFIG")
        print("=" * 80)
        print(json.dumps(pf, default=str, indent=2, ensure_ascii=False)[:2000])

    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
