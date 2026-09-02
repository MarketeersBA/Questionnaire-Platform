import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId("6a3b8939b3fa5ef1308239ed")})
        
        # Check blueprint
        bp = survey.get("blueprint", {})
        print("BLUEPRINT:")
        print(json.dumps(bp, default=str, indent=2, ensure_ascii=False)[:3000])
        
        # Check layer1_rules
        l1 = survey.get("layer1_rules", {})
        print("\nLAYER1 RULES:")
        print(json.dumps(l1, default=str, indent=2, ensure_ascii=False)[:2000])
        
        # Check customizations
        cust = survey.get("customizations", {})
        print("\nCUSTOMIZATIONS:")
        print(json.dumps(cust, default=str, indent=2, ensure_ascii=False)[:2000])
        
        # Check the template itself
        template = await db.get_collection("survey_templates").find_one({"_id": ObjectId("69a00641461d731e3134a134")})
        if template:
            print("\nTEMPLATE KEYS:")
            for k in sorted(template.keys()):
                val = template[k]
                if isinstance(val, list):
                    print(f"  {k}: list[{len(val)}]")
                elif isinstance(val, dict):
                    print(f"  {k}: dict[{len(val)} keys]")
                else:
                    print(f"  {k}: {type(val).__name__} = {str(val)[:80]}")
        
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
