import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from bson import ObjectId

async def main():
    db.connect()
    try:
        # Get the HERO survey's actual response structure to list what taste_test questions exist
        responses = await db.get_collection("survey_responses").find({"survey_id": "6a3b8939b3fa5ef1308239ed"}).to_list(length=1)
        if responses:
            tt = responses[0].get("taste_test", {})
            rot = tt.get("rotations", [{}])[0]
            
            print("TASTE TEST MODULE - Questions (derived from response data)")
            print("="*80)
            
            print("\n1. PREFERENCE QUESTION:")
            print(f"   flavor: {tt.get('flavor')}")
            print(f"   preferred_brand: {tt.get('preferred_brand')}")
            print(f"   preferred_brand_other (why): {str(tt.get('preferred_brand_other',''))[:100]}")
            
            print(f"\n2. PER-BRAND EVALUATION ({len(tt.get('rotations',[]))} rotations):")
            print(f"   purchase_price: (numeric)")
            
            print(f"\n3. SCALE SCORES ({len(rot.get('scores',{}))} attributes):")
            for i, (attr, val) in enumerate(rot.get("scores", {}).items(), 1):
                # Determine scale
                if attr == "Overall Likeness" or attr == "Essence":
                    scale = "1-9 (hedonic)"
                else:
                    scale = "1-5 (diagnostic)"
                print(f"   {i:2d}. {attr} -> Scale: {scale}")
            
            print(f"\n4. OPEN-ENDED QUESTIONS ({len(rot.get('open_ends',{}))} per brand):")
            for key in rot.get("open_ends", {}):
                print(f"   - {key}")
                
        # Also get demographics questions
        print("\n" + "="*80)
        print("DEMOGRAPHICS MODULE - Fields")
        print("="*80)
        demo = responses[0].get("demographics", {})
        for k in demo:
            print(f"   - {k}: {demo[k]}")

        # Purchase funnel response structure
        print("\n" + "="*80)
        print("PURCHASE FUNNEL MODULE - Response Fields")
        print("="*80)
        pf = responses[0].get("purchase_funnel", {})
        for k, v in pf.items():
            print(f"   - {k}: {type(v).__name__} = {str(v)[:100]}")
            
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
