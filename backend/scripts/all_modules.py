import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # Get all question modules from DB
        modules = await db.get_collection("question_modules").find({}).to_list(length=None)
        print(f"FOUND {len(modules)} QUESTION MODULES IN DB")
        for mod in modules:
            print(f"\n{'='*80}")
            print(f"Module: {mod.get('name')} (ID: {mod.get('module_id', mod.get('_id'))})")
            print(f"Description: {mod.get('description', '')[:200]}")
            sections = mod.get("sections", [])
            for sec in sections:
                title = sec.get("title_en", sec.get("section_id", ""))
                print(f"\n  Section: {title}")
                for q in sec.get("questions", []):
                    qid = q.get("question_id", "")
                    label = q.get("label", "")
                    qtype = q.get("type", "")
                    en = q.get("en_text", "")
                    ar = q.get("ar_text", "")
                    role = q.get("analytical_role", "")
                    print(f"    [{qid}] {label} ({qtype}, role={role})")
                    print(f"         EN: {en}")
                    print(f"         AR: {ar}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
