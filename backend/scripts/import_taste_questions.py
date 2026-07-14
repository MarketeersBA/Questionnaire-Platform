import pandas as pd
import asyncio
from datetime import datetime
from backend.database import db
from backend.models import MasterQuestion
from backend.config import settings

async def import_questions():
    print("Connecting to database...")
    db.connect()
    
    csv_path = "taste_survey_200_questions.csv"
    print(f"Reading {csv_path}...")
    
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    questions_col = db.get_collection("master_questions")
    now = datetime.utcnow()
    
    imported_count = 0
    for _, row in df.iterrows():
        # Parse Sub-Attributes Covered
        sub_attrs_raw = str(row['Sub-Attributes Covered'])
        if sub_attrs_raw.lower() == 'all sub-attributes':
            sub_attrs = ["All"]
        else:
            sub_attrs = [s.strip() for s in sub_attrs_raw.split(',') if s.strip()]

        # Parse Options / Scale Description
        options_raw = str(row['Options / Scale Description']) if pd.notna(row['Options / Scale Description']) else ""
        options = []
        if options_raw:
            # Handle "A) ... | B) ..." format
            if '|' in options_raw:
                options = [o.strip() for o in options_raw.split('|') if o.strip()]
            # Handle "Yes / No"
            elif '/' in options_raw and len(options_raw) < 20:
                options = [o.strip() for o in options_raw.split('/') if o.strip()]
            else:
                options = [options_raw.strip()]

        q_data = {
            "question_id": row['Question ID'],
            "section": row['Section'],
            "main_attribute": row['Main Attribute'],
            "sub_attributes": sub_attrs,
            "question_type": row['Question Type'],
            "question_text": row['Question'],
            "options": options,
            "analysis_purpose": row['Analysis Purpose'] if pd.notna(row['Analysis Purpose']) else None,
            "created_at": now,
            "updated_at": now
        }
        
        # Upsert by question_id
        await questions_col.update_one(
            {"question_id": q_data["question_id"]},
            {"$set": q_data},
            upsert=True
        )
        imported_count += 1
        if imported_count % 50 == 0:
            print(f"Imported {imported_count} questions...")

    print(f"Import complete! Total: {imported_count} questions.")
    db.close()

if __name__ == "__main__":
    asyncio.run(import_questions())
