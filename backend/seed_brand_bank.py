import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Define the attributes provided by the user
BRAND_ATTRIBUTES = [
    {"id": "trustworthy", "label_en": "A trustworthy brand", "label_ar": "براند موثوق فيه", "category": "personality", "order": 1},
    {"id": "innovative", "label_en": "An innovative brand", "label_ar": "براند مبتكر", "category": "innovation", "order": 2},
    {"id": "expert", "label_en": "An expert brand", "label_ar": "براند خبير", "category": "personality", "order": 3},
    {"id": "famous", "label_en": "A well-known brand", "label_ar": "براند مشهور", "category": "personality", "order": 4},
    {"id": "youthful_fun", "label_en": "A youthful and fun brand", "label_ar": "براند شبابي وممتع", "category": "personality", "order": 5},
    {"id": "natural", "label_en": "A brand that uses natural ingredients", "label_ar": "براند بيستخدم مكونات طبيعية", "category": "quality", "order": 6},
    {"id": "feel_special", "label_en": "Makes me feel special when using it", "label_ar": "بحس إني مميز وأنا بستخدمه", "category": "emotional", "order": 7},
    {"id": "chic_elegant", "label_en": "A chic and elegant brand", "label_ar": "براند شيك وأنيق", "category": "personality", "order": 8},
    {"id": "value_for_money", "label_en": "Value for money", "label_ar": "قيمة مقابل السعر", "category": "value", "order": 9},
    {"id": "high_quality", "label_en": "High quality", "label_ar": "جودة عالية", "category": "quality", "order": 10},
    {"id": "affordable", "label_en": "An affordable brand", "label_ar": "براند اقتصادي", "category": "value", "order": 11},
]

async def seed_brand_bank():
    mongo_uri = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
    db_name = os.getenv("DATABASE_NAME", "survey_platform")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_database(db_name)
    col = db.get_collection("brand_attribute_banks")
    
    # Upsert the global bank
    now = datetime.utcnow()
    bank_data = {
        "name": "Standard Brand Image Bank",
        "is_global": True,
        "attributes": BRAND_ATTRIBUTES,
        "updated_at": now
    }
    
    await col.update_one(
        {"is_global": True},
        {"$set": bank_data},
        upsert=True
    )
    print("Successfully seeded Brand Image Bank with user-provided attributes.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_brand_bank())
