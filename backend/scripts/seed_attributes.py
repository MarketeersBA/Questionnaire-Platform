import asyncio
from backend.database import db
from backend.config import settings
from datetime import datetime

async def seed_attributes():
    print("Connecting to database...")
    db.connect()
    
    banks_col = db.get_collection("attribute_banks")
    
    attributes_data = {
        "appearance": {
            "display_name": "Appearance",
            "suggestions": [
                "Not Appetitive", "Appetitive", "Dull Surface", "Shiny Surface", 
                "Rough Surface", "Smooth Surface", "Uniform Shape", 
                "Irregular Shape", "Dry Looking", "Moist Looking"
            ]
        },
        "color": {
            "display_name": "Color",
            "suggestions": [
                "Light Color", "Extra Yellow Color", "Pale White", "Creamy White", 
                "Golden Yellow", "Dark Yellow", "Uneven Color", 
                "Spotty Discoloration", "Artificial Looking", "Natural Looking"
            ]
        },
        "odor": {
            "display_name": "Odor",
            "suggestions": [
                "Light Odor", "Fresh Milk Odor", "Not Creamy Odor", "Strong Odor", 
                "Sour Smell", "Rancid Smell", "No Distinct Smell", 
                "Buttery Aroma", "Fermented Odor", "Pleasant Aroma"
            ]
        },
        "texture": {
            "display_name": "Texture",
            "suggestions": [
                "Hard", "Melts Easily", "Greasy", "Grainy Texture", 
                "Sticky Texture", "Creamy Texture", "Crumbly", 
                "Elastic", "Rubbery", "Soft"
            ]
        },
        "before_taste": {
            "display_name": "Before Taste",
            "suggestions": [
                "Cream-Free", "Cooked Milk Taste", "Fatty", 
                "Hardly Melts in the mouth", "Watery", "Chalky", "Gritty", 
                "Oily Coating", "Waxy", "Powdery"
            ]
        },
        "after_taste": {
            "display_name": "After Taste",
            "suggestions": [
                "Extremely Bitter", "Too Sweet", "Too Salty", 
                "Metallic Aftertaste", "Lingering Creaminess", "Clean Finish", 
                "Sour Aftertaste", "Bland Aftertaste", "Sharp Aftertaste", "Refreshing Finish"
            ]
        },
        "overall_taste": {
            "display_name": "Overall Taste",
            "suggestions": [
                "Well Balanced", "Bland", "Artificial Flavor", "Natural Flavor", 
                "Overpowering", "Subtle", "Complex", "One-Dimensional", 
                "Harmonious", "Off-Putting"
            ]
        },
        "overall_likeness": {
            "display_name": "Overall Likeness",
            "suggestions": [
                "Highly Acceptable", "Moderately Acceptable", "Slightly Acceptable", 
                "Neutral", "Slightly Unacceptable", "Moderately Unacceptable", 
                "Highly Unacceptable", "Would Purchase Again", "Would Recommend", 
                "Would Not Consume Again"
            ]
        }
    }
    
    now = datetime.utcnow()
    
    for category, content in attributes_data.items():
        print(f"Seeding {content['display_name']}...")
        
        # Map suggestions to the Attribute model structure expected by the backend
        core_attrs = []
        for suggestion in content["suggestions"]:
            core_attrs.append({
                "attribute_id": suggestion.lower().replace(" ", "_"),
                "label": suggestion,
                "scale_type": "scale",
                "is_required": False,
                "diagnostic_group": "sensory_suggestion"
            })
            
        bank_doc = {
            "category": category,
            "display_name": content["display_name"],
            "version": 1,
            "core_attributes": core_attrs,
            "sub_attributes": [],
            "created_at": now,
            "updated_at": now
        }
        
        # Upsert by category
        await banks_col.update_one(
            {"category": category},
            {"$set": bank_doc},
            upsert=True
        )
        
    print("Seeding complete!")
    db.close()

if __name__ == "__main__":
    asyncio.run(seed_attributes())
