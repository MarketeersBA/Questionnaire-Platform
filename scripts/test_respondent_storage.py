import asyncio
import os
import sys
from datetime import datetime
from bson import ObjectId

# Add current directory to path so we can import backend
sys.path.append(os.getcwd())

from backend.database import db
from backend.models import Respondent

async def verify_respondent_storage():
    print("--- VERIFYING RESPONDENT STORAGE ---")
    db.connect()
    print(f"Connected to DB: {db.db.name}")
    
    # 1. Setup Mock Data
    test_phone = "+201234567890"
    test_answers = {
        "Full Name": "Refined Test User",
        "Age Range": "19-25",
        "Gender": "Female",
        "Area": "Cairo, Egypt",
        "Email Address": "refined@example.com"
    }
    test_token = "REFINED-TOKEN-456"
    test_survey_id = str(ObjectId())
    
    # 2. Simulate the logic from public.py submit_layer1
    print(f"Simulating Layer 1 submission for phone: {test_phone}")
    
    try:
        # Save L1 answers as a response record
        await db.get_collection("responses").insert_one({
            "survey_id": test_survey_id,
            "token": test_token,
            "phone": test_phone,
            "answers": test_answers,
            "source": "layer1",
            "submitted_at": datetime.utcnow()
        })
        
        # Upsert Respondent record
        respondent_data = {
            "phone": test_phone,
            "name": test_answers.get("name") or test_answers.get("Full Name"),
            "email": test_answers.get("email") or test_answers.get("Email Address"),
            "age_range": test_answers.get("Age Range") or test_answers.get("age_auto"),
            "area": test_answers.get("area") or test_answers.get("Area"),
            "gender": test_answers.get("gender") or test_answers.get("gender_auto") or test_answers.get("Gender"),
            "updated_at": datetime.utcnow()
        }
        
        # Clean None/0 values
        respondent_data = {k: v for k, v in respondent_data.items() if v}
        
        await db.get_collection("respondents").update_one(
            {"phone": test_phone},
            {
                "$set": respondent_data,
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # 3. Verify in DB
        print("Checking database for results...")
        
        response = await db.get_collection("responses").find_one({"token": test_token})
        if response:
            print(f"✅ Response saved: {response['phone']} - {response['source']}")
        else:
            print("❌ Response NOT found!")
            
        respondent = await db.get_collection("respondents").find_one({"phone": test_phone})
        if respondent:
            print(f"✅ Respondent saved/updated: {respondent['name']} ({respondent['phone']}) - Age: {respondent.get('age')}")
        else:
            print("❌ Respondent NOT found!")
            
        # Cleanup
        await db.get_collection("responses").delete_one({"token": test_token})
        await db.get_collection("respondents").delete_one({"phone": test_phone})
        print("--- VERIFICATION COMPLETE ---")
        
    except Exception as e:
        print(f"❌ Error during verification: {e}")

if __name__ == "__main__":
    asyncio.run(verify_respondent_storage())
