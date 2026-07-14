
import asyncio
import pandas as pd
from backend.database import db
from backend.models import TasteTestQuestion
from datetime import datetime
from backend.utils.taste_test_question_ids import TASTE_TEST_QUESTION_ID_PREFIX, build_tt_question_id

async def import_data():
    db.connect()
    file_path = "Taste_Test_restructured.xlsx"
    xl = pd.ExcelFile(file_path)
    df = xl.parse("Sheet1")
    
    questions_col = db.get_collection("taste_test_questions")
    
    # Clear existing data as requested (isolated and clean start)
    await questions_col.delete_many({})
    print("Cleared existing taste_test_questions collection.")

    records = df.where(pd.notnull(df), None).to_dict(orient='records')
    
    to_insert = []
    import re

    def extract_labels(option_str):
        if not option_str or '=' not in str(option_str):
            return None, None
        
        # Pattern to match "1 = Min Label, X = Max Label"
        # We look for something like "1 = [text], [number] = [text]"
        # Matches: 1 = Not good, 10 = Very good
        # Matches: 1 = وحش قوي، 5 = حلو قوي
        
        parts = re.split(r'[,،]', str(option_str))
        min_label, max_label = None, None
        
        for part in parts:
            if '=' in part:
                val_label = part.split('=', 1)
                val = val_label[0].strip()
                label = val_label[1].strip()
                
                if val == '1':
                    min_label = label
                else:
                    max_label = label
                    
        return min_label, max_label

    for index, row in enumerate(records, start=1):
        ar_min, ar_max = extract_labels(row.get("Ar Options"))
        en_min, en_max = extract_labels(row.get("En Options"))

        q = {
            "question_id": build_tt_question_id(index),
            "legacy_id": None,
            "question_id_prefix": TASTE_TEST_QUESTION_ID_PREFIX,
            "main_att": row["main_att"],
            "supp_att": row["supp_att"],
            "question_type": row["Question Type"],
            "ar_text": row["Ar"],
            "en_text": row["En"],
            "ar_options": row["Ar Options"],
            "en_options": row["En Options"],
            "ar_min_label": ar_min,
            "ar_max_label": ar_max,
            "en_min_label": en_min,
            "en_max_label": en_max,
            "timing": row["En when to ask"], # "Before Taste" or "After Taste"
            "question_status": row["Question Status"], # "fixed" or "optional"
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        to_insert.append(q)
    
    if to_insert:
        await questions_col.insert_many(to_insert)
        print(f"Successfully imported {len(to_insert)} questions into taste_test_questions.")
    else:
        print("No questions found to import.")

if __name__ == "__main__":
    asyncio.run(import_data())
