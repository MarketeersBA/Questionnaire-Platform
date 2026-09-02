import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # List all surveys to see types/modules used
        surveys = await db.get_collection("surveys").find({}).to_list(length=None)
        print("ALL SURVEYS:")
        for s in surveys:
            print(f"  ID: {s['_id']} | Name: {s.get('company_name')} | Type: {s.get('type')} | Has modules: {'modules' in s}")
            if "modules" in s:
                for mod in s.get("modules", []):
                    print(f"    Module: {mod.get('type')} enabled: {mod.get('enabled')}")
        
        # Check the survey templates for questions
        templates = await db.get_collection("survey_templates").find({}).to_list(length=None)
        print(f"\nFOUND {len(templates)} TEMPLATES")
        for t in templates:
            print(f"\n  Template: {t.get('name', 'Unnamed')} (ID: {t['_id']})")
            print(f"  Keys: {list(t.keys())}")
            # Check for sections/questions
            for k in ["sections", "questions", "pages", "modules"]:
                if k in t:
                    val = t[k]
                    if isinstance(val, list):
                        print(f"    {k}: list[{len(val)}]")
                        for idx, item in enumerate(val[:3]):
                            if isinstance(item, dict):
                                print(f"      [{idx}] keys: {list(item.keys())[:8]}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
