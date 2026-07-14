import asyncio
import os
import sys
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27018/survey_platform")
DATABASE_NAME = os.getenv("DATABASE_NAME", "survey_platform")

# Brand Equity & Perception Attributes
BRAND_ATTRIBUTES = [
    { "id": "trustworthy", "label_en": "A trustworthy brand", "label_ar": "براند موثوق فيه", "category": "trust" },
    { "id": "innovative", "label_en": "An innovative brand", "label_ar": "براند مبتكر", "category": "innovation" },
    { "id": "expert", "label_en": "An expert brand", "label_ar": "براند خبير", "category": "performance" },
    { "id": "well_known", "label_en": "A well-known brand", "label_ar": "براند مشهور", "category": "awareness" },
    { "id": "youthful", "label_en": "A youthful and fun brand", "label_ar": "براند شبابي وممتع", "category": "personality" },
    { "id": "natural", "label_en": "A brand that uses natural ingredients", "label_ar": "براند بيستخدم مكونات طبيعية", "category": "quality" },
    { "id": "special", "label_en": "Makes me feel special when using it", "label_ar": "بحس إني مميز وأنا بستخدمه", "category": "emotional" },
    { "id": "chic", "label_en": "A chic and elegant brand", "label_ar": "براند شيك وأنيق", "category": "status" },
    { "id": "value", "label_en": "Value for money", "label_ar": "قيمة مقابل السعر", "category": "value" },
    { "id": "high_quality", "label_en": "High quality", "label_ar": "جودة عالية", "category": "quality" },
    { "id": "affordable", "label_en": "An affordable brand", "label_ar": "براند اقتصادي", "category": "value" },
    # FMCG Specific
    { "id": "widely_available", "label_en": "Widely available", "label_ar": "موجود في كل مكان", "category": "availability" },
    { "id": "good_packaging", "label_en": "Attractive packaging", "label_ar": "تغليف جذاب", "category": "appearance" },
    { "id": "consistent_taste", "label_en": "Consistent taste", "label_ar": "طعم ثابت", "category": "performance" }
]

async def seed_brand_bank():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.get_database(DATABASE_NAME)
    col = db.get_collection("brand_attribute_banks")
    
    print(f"Connected to MongoDB. Seeding Brand Attribute Bank...")
    
    # We use a single global document for the Brand Analyzer bank
    now = datetime.utcnow()
    doc = {
        "is_global": True,
        "name": "Global Brand Attribute Bank",
        "attributes": BRAND_ATTRIBUTES,
        "updated_at": now
    }
    
    existing = await col.find_one({"is_global": True})
    if existing:
        await col.replace_one({"_id": existing["_id"]}, doc)
        print("Updated global brand attribute bank.")
    else:
        await col.insert_one(doc)
        print("Inserted new global brand attribute bank.")

    print("Seeding complete.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_brand_bank())
