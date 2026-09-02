import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # Get one response to see the full structure of the data
        response = await db.get_collection("survey_responses").find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if response:
            print("RESPONSE KEYS:")
            for k in sorted(response.keys()):
                val = response[k]
                if isinstance(val, list):
                    print(f"  {k}: list[{len(val)}]")
                elif isinstance(val, dict):
                    print(f"  {k}: dict[{len(val)} keys]")
                else:
                    print(f"  {k}: {type(val).__name__} = {str(val)[:80]}")
            
            # demographics
            demo = response.get("demographics", {})
            print("\nDEMOGRAPHICS:")
            print(json.dumps(demo, default=str, indent=2, ensure_ascii=False)[:2000])
            
            # purchase_funnel
            pf = response.get("purchase_funnel", {})
            print("\nPURCHASE FUNNEL:")
            print(json.dumps(pf, default=str, indent=2, ensure_ascii=False)[:2000])
            
            # taste_test structure
            tt = response.get("taste_test", {})
            print("\nTASTE TEST KEYS:", list(tt.keys()))
            print("flavor:", tt.get("flavor"))
            print("preferred_brand:", tt.get("preferred_brand"))
            print("preferred_brand_other:", tt.get("preferred_brand_other", "")[:200])
            
            # rotations
            rotations = tt.get("rotations", [])
            if rotations:
                rot1 = rotations[0]
                print(f"\nROTATION 1 (Brand: {rot1.get('brand')}):")
                print(f"  purchase_price: {rot1.get('purchase_price')}")
                print(f"  scores ({len(rot1.get('scores', {}))} attributes):")
                for attr, val in rot1.get("scores", {}).items():
                    print(f"    {attr}: {val}")
                print(f"  open_ends:")
                for key, val in rot1.get("open_ends", {}).items():
                    print(f"    {key}: {str(val)[:100]}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
