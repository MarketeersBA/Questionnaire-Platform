import csv
import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

from backend.database import db

async def import_structural_questions():
    """
    Imports structural foundation questions from:
    1. attribute_per_section_30questions.csv (Main Attributes)
    2. custom_attribute_3questions.csv (Custom Attributes)
    """
    db.connect()
    col = db.get_collection("structural_questions")
    
    # Clear existing structural questions to avoid duplicates on re-run
    await col.delete_many({})
    
    total_imported = 0

    # 1. Import Main Attribute Questions
    main_attr_file = "attribute_per_section_30questions.csv"
    if os.path.exists(main_attr_file):
        with open(main_attr_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                doc = {
                    "question_id": row["Question ID"],
                    "main_attribute": row["Main Attribute"],
                    "question_type": row["Question Type"],
                    "question_text": row["Question"],
                    "options_raw": row["Options / Scale Description"],
                    "analysis_purpose": row["Analysis Purpose"],
                    "is_custom": False
                }
                
                # Cleanup options
                options = []
                if doc["question_type"] == "Yes-No":
                    options = ["Yes", "No"]
                elif "Scale" in doc["question_type"]:
                    # We store range for backend mapping
                    pass
                
                doc["options"] = options
                await col.insert_one(doc)
                total_imported += 1
        print(f"Imported {total_imported} main structural questions.")

    # 2. Import Custom Attribute Questions
    custom_attr_file = "custom_attribute_3questions.csv"
    if os.path.exists(custom_attr_file):
        with open(custom_attr_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                doc = {
                    "question_id": row["Question ID"],
                    "section": row["Section"],
                    "question_type": row["Question Type"],
                    "question_text": row["Question"],
                    "options_raw": row["Options / Scale Description"],
                    "analysis_purpose": row["Analysis Purpose"],
                    "is_custom": True
                }
                
                options = []
                if doc["question_type"] == "Yes-No":
                    options = ["Yes", "No"]
                
                doc["options"] = options
                await col.insert_one(doc)
                count += 1
                total_imported += 1
        print(f"Imported {count} custom structural questions.")

    # Create Index
    await col.create_index("main_attribute")
    await col.create_index("is_custom")
    
    print(f"Final Total Imported: {total_imported}")

if __name__ == "__main__":
    asyncio.run(import_structural_questions())
