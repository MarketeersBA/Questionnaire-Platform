import asyncio
import argparse
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
import sys
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# --- Constants & Mappings ---

SURVEY_ID = "hero_protein_bar_legacy"
BRAND_HERO = "هيرو (مثلث)"
BRAND_ABU_AUF = "ابو عوف (مربع)"

MOCK_PRICES = {
    BRAND_HERO: 35.0,
    BRAND_ABU_AUF: 45.0
}

# Mapping for demographics
GENDER_MAP = {"1": "male", "2": "female"}
AGE_MAP = {
    "1": "18-24",
    "2": "25-34",
    "3": "35-44",
    "4": "45-54",
    "5": "55+"
}

# Purchase Funnel Column Mapping
PF_MAPPING = {
    "tom": "لما تسمع \"بروتين بار\" إيه هي أول ماركة بتيجي في بالك؟",
    "tom_other": "لما تسمع \"بروتين بار\" إيه هي أول ماركة بتيجي في بالك؟_33_other",
    "unaided": "إيه ماركات تانية للبروتين بار تعرفها؟_{i}",
    "unaided_other": "إيه ماركات تانية للبروتين بار تعرفها؟_33_other",
    "aided": "طب تعرف ايه من الماركات دي؟_{i}",
    "aided_other": "طب تعرف ايه من الماركات دي؟_33_other",
    "trial": "ايه من الماركات دي حضرتك جربتها قبل كده؟_{i}",
    "trial_other": "ايه من الماركات دي حضرتك جربتها قبل كده؟_33_other",
    "consideration": "ايه من الماركات دي جبتها  في أخر 6 شهور؟_{i}",
    "consideration_other": "ايه من الماركات دي جبتها  في أخر 6 شهور؟_33_other",
    "repurchase_p12m": "ايه من الماركات دي جبتها  في أخر 3 شهور؟_{i}",
    "repurchase_p12m_other": "ايه من الماركات دي جبتها  في أخر 3 شهور؟_33_other",
    "mou": "ايه الماركة اللي حضرتك بتجيبها دايما؟",
    "mou_other": "ايه الماركة اللي حضرتك بتجيبها دايما؟_33_other"
}

# Physical Column sets (0=R1, 1=R2, 2=R3)
# Gap between brand and likeness is consistently ~31 columns
# We'll use the specific column suffixes found in the CSV
ATTR_SETS = [
    {"suffix": "", "brand_col": "FirstRotationBrand"},        # R1: cols 185-215
    {"suffix": "2", "brand_col": "SecondRotationBrand"},      # R2: cols 219-249 (actually some suffix is missing but index is key)
    {"suffix": "29", "brand_col": "SecondRotationBrandابو عوف (مربع)"} # R3: cols 253-283
]

# We need the EXACT column names for each set
# I'll build them dynamically based on the base names
BASE_ATTRS = {
    "Outershape": "إيه رأيك في شكل المنتج من بره؟",
    "Outercolor": "إيه رأيك في اللون؟",
    "Smell": "قيم ريحة المنتج بشكل عام",
    "Natural Smell": "هل ريحة المنتج باينة طبيعية؟",
    "Innercolor": "إيه رأيك في لون المنتج من جوه؟",
    "Natural Inside": "هل شكل المنتج من جوه باين إنه طبيعي؟",
    "Texture": "إيه رأيك في ملمس وقوام المنتج؟",
    "Consistency": "شايف قوام المنتج متماسك قد إيه؟",
    "Firmness": "إيه رأيك في نشوفية أو طراوة المنتج؟", # Note: slightly different in CSV range check, I'll be careful
    "Freshness": "شكل المنتج باين عليه طازة ولا لأ؟",
    "Size": "شايف حجم المنتج ازاي؟",
    "General Shape": "ايه تقييمك لشكل المنتج ككل؟",
    "Ease of Bite": "إلى أي مدى سهل في القطم؟",
    "Chewing Experience": "تجربة مضغ المنتج كانت عاملة إزاي معاك؟",
    "Ease of Swallow": "بلع المنتج كان سهل ولا صعب؟",
    "Eating Experience": "قيم تجربة تناول المنتج بشكل عام",
    "Natural Taste": "حسيت إن طعم المنتج طبيعي؟",
    "Taste Intensity": "نكهة المنتج باينة وقوية قد إيه؟",
    "Sweetness": "إيه رأيك في درجة السكر في المنتج؟",
    "Taste Consistency": "إيه رأيك في تناسق الطعم والنكهات مع بعض؟",
    "After Taste": "ايه تقييمك للطعم بعد البلع؟",
    "Bitterness": "حسيت بأي طعم مرارة في المنتج؟",
    "After Taste Duration": "الطعم فضل في بوقك قد إيه بعد ما خلصت؟",
    "Taste Quality": "قيم طعم ومذاق المنتج بشكل عام",
    "Overall Likeness": "قيم إعجابك العام بالمنتج",
}

# The CSV has some manual suffix overrides I found in the check_col_range output
# I'll use those exact suffixes
ATTR_NAME_OVERRIDES = {
    1: { # R2 set (index starts ~219)
        "Outershape": "إيه رأيك في شكل المنتج من بره؟2",
        "Outercolor": "إيه رأيك في اللون؟3",
        "Smell": "قيم ريحة المنتج بشكل عام4",
        "Natural Smell": "هل ريحة المنتج باينة طبيعية؟5",
        "Innercolor": "إيه رأيك في لون المنتج من جوه؟6",
        "Natural Inside": "هل شكل المنتج من جوه باين إنه طبيعي؟7",
        "Texture": "إيه رأيك في ملمس وقوام المنتج؟8",
        "Consistency": "شايف قوام المنتج متماسك قد إيه؟9",
        "Firmness": "إيه رأيك في درجة نشوفية أو طراوة المنتج؟10",
        "Freshness": "شكل المنتج باين عليه طازة ولا لأ؟11",
        "Size": "شايف حجم المنتج ازاي؟12",
        "General Shape": "ايه تقييمك لشكل المنتج ككل؟13",
        "Ease of Bite": "إلى أي مدى سهل في القطم؟14",
        "Chewing Experience": "تجربة مضغ المنتج كانت عاملة إزاي معاك؟15",
        "Ease of Swallow": "بلع المنتج كان سهل ولا صعب؟16",
        "Eating Experience": "قيم تجربة تناول المنتج بشكل عام17",
        "Natural Taste": "حسيت إن طعم المنتج طبيعي؟18",
        "Taste Intensity": "نكهة المنتج باينة وقوية قد إيه؟19",
        "Sweetness": "إيه رأيك في درجة السكر في المنتج؟20",
        "Taste Consistency": "إيه رأيك في تناسق الطعم والنكهات مع بعض؟21",
        "After Taste": "ايه تقييمك للطعم بعد البلع؟22",
        "Bitterness": "حسيت بأي طعم مرارة في المنتج؟23",
        "After Taste Duration": "الطعم فضل في بوقك قد إيه بعد ما خلصت؟26",
        "Taste Quality": "قيم طعم ومذاق المنتج بشكل عام27",
        "Overall Likeness": "قيم إعجابك العام بالمنتج28",
    },
    2: { # R3 set (index starts ~253)
        "Outershape": "إيه رأيك في شكل المنتج من بره؟29",
        "Outercolor": "إيه رأيك في اللون؟30",
        "Smell": "قيم ريحة المنتج بشكل عام31",
        "Natural Smell": "هل ريحة المنتج باينة طبيعية؟32",
        "Innercolor": "إيه رأيك في لون المنتج من جوه؟33",
        "Natural Inside": "هل شكل المنتج من جوه باين إنه طبيعي؟34",
        "Texture": "إيه رأيك في ملمس وقوام المنتج؟35",
        "Consistency": "شايف قوام المنتج متماسك قد إيه؟36",
        "Firmness": "إيه رأيك في درجة نشوفية أو طراوة المنتج؟37",
        "Freshness": "شكل المنتج باين عليه طازة ولا لأ؟38",
        "Size": "شايف حجم المنتج ازاي؟39",
        "General Shape": "ايه تقييمك لشكل المنتج ككل؟40",
        "Ease of Bite": "إلى أي مدى سهل في القطم؟41",
        "Chewing Experience": "تجربة مضغ المنتج كانت عاملة إزاي معاك؟42",
        "Ease of Swallow": "بلع المنتج كان سهل ولا صعب؟43",
        "Eating Experience": "قيم تجربة تناول المنتج بشكل عام44",
        "Natural Taste": "حسيت إن طعم المنتج طبيعي؟45",
        "Taste Intensity": "نكهة المنتج باينة وقوية قد إيه؟46",
        "Sweetness": "إيه رأيك في درجة السكر في المنتج؟47",
        "Taste Consistency": "إيه رأيك في تناسق الطعم والنكهات مع بعض؟48",
        "After Taste": "ايه تقييمك للطعم بعد البلع؟49",
        "Bitterness": "حسيت بأي طعم مرارة في المنتج؟50",
        "After Taste Duration": "الطعم فضل في بوقك قد إيه بعد ما خلصت؟53",
        "Taste Quality": "قيم طعم ومذاق المنتج بشكل عام54",
        "Overall Likeness": "قيم إعجابك العام بالمنتج55",
    }
}

OPEN_ENDS = {
    0: {
        "favorite_shape": "FavoriteInShape",
        "worst_shape": "WorstInShape",
        "improvement_shape": "ImprovementInShape",
        "favorite_taste": "FavoriteInTaste",
        "worst_taste": "WorstInTaste",
        "improvement_taste": "ImprovementInTaste",
    },
    1: {
        "favorite_shape": "FavoriteInShape1",
        "worst_shape": "WorstInShape1",
        "improvement_shape": "ImprovementInShape1",
        "favorite_taste": "FavoriteInTaste24",
        "worst_taste": "WorstInTaste25",
        "improvement_taste": "ImprovementInTaste1",
    },
    2: {
        "favorite_shape": "FavoriteInShape2",
        "worst_shape": "WorstInShape2",
        "improvement_shape": "ImprovementInShape2",
        "favorite_taste": "FavoriteInTaste51",
        "worst_taste": "WorstInTaste52",
        "improvement_taste": "ImprovementInTaste2",
    }
}

# --- Platform Registration ---

async def ensure_survey_registry(db, template_id: str, username: str):
    surveys_col = db["surveys"]
    existing = await surveys_col.find_one({"survey_code": SURVEY_ID, "is_deleted": {"$ne": True}})
    
    survey_data = {
        "company_name": "Hero Protein Bar Taste Test (Legacy)",
        "survey_code": SURVEY_ID,
        "status": "active",
        "template_id": template_id,
        "template_version": 1,
        "type": "taste_test",
        "industry": "Consumer Goods",
        "sample_capacity": 400,
        "respondent_count": 400,
        "created_by": username,
        "created_at": datetime.now(timezone.utc),
        "is_deleted": False,
        "customizations": {"brands": [BRAND_HERO, BRAND_ABU_AUF], "category": "Protein Bars"},
        "layer1_rules": {"extra_conditions": []},
        "google_form_id": "legacy_hero",
        "google_form_url": "https://docs.google.com/forms/d/legacy_hero",
        "template_snapshot_schema": {},
        "template_snapshot_questions": [],
        "blueprint": {
            "category": "Protein Bars",
            "own_brand": BRAND_HERO,
            "brands": [
                {"name": BRAND_HERO, "role": "internal"},
                {"name": BRAND_ABU_AUF, "role": "competitor"}
            ]
        },
        "taste_test_config": {
            "attribute_sequence": [
                {"main_attribute": k, "source": "library", "sub_attributes": [k]} 
                for k in list(BASE_ATTRS.keys())
            ]
        }
    }
    
    if existing:
        await surveys_col.update_one({"_id": existing["_id"]}, {"$set": survey_data})
        return str(existing["_id"])
    else:
        result = await surveys_col.insert_one(survey_data)
        return str(result.inserted_id)

# --- Helper Functions ---

def clean_val(val):
    if pd.isna(val) or val == "" or val == "nan":
        return None
    try:
        if isinstance(val, (int, float)):
            return float(val)
        return str(val).strip()
    except:
        return str(val).strip()

def get_slots(row, pattern, range_limit=35):
    slots = []
    for i in range(1, range_limit + 1):
        col = pattern.format(i=i)
        if col in row and clean_val(row[col]) == 1:
            slots.append(i)
    return slots

def get_scores_for_set(data, set_idx):
    # Determine column names for this set
    cols_map = ATTR_NAME_OVERRIDES.get(set_idx, BASE_ATTRS)
    
    # Check Overall Likeness first to see if evaluation exists
    likeness_col = cols_map.get("Overall Likeness", BASE_ATTRS["Overall Likeness"])
    likeness = clean_val(data.get(likeness_col))
    if likeness is None:
        return None
        
    scores = {"Overall Likeness": likeness}
    for key, base_col in BASE_ATTRS.items():
        if key == "Overall Likeness": continue
        actual_col = cols_map.get(key, base_col)
        scores[key] = clean_val(data.get(actual_col))
        
    # Essence = mean(Innercolor, Natural Inside) * 2
    inner = scores.get("Innercolor")
    natural = scores.get("Natural Inside")
    if inner is not None and natural is not None:
        scores["Essence"] = round((float(inner) + float(natural)) / 2 * 2, 1)
        
    return scores

def get_open_ends_for_set(data, set_idx):
    oe_cols = OPEN_ENDS.get(set_idx, {})
    return {k: clean_val(data.get(v)) for k, v in oe_cols.items()}

def transform_row(idx, row):
    data = row.to_dict()
    
    def get_mapped(val, mapping):
        val = clean_val(val)
        if val is None: return "unknown"
        try:
            key = str(int(float(val)))
            return mapping.get(key, "unknown")
        except: return "unknown"

    respondent_id = f"HERO-{idx+1:04d}"
    gender = get_mapped(data.get("Gender"), GENDER_MAP)
    age_group = get_mapped(data.get("Age"), AGE_MAP)
    
    # 1. Demographics in Platform Format
    answers = {
        "gender": gender,
        "age": age_group,
        "area": "Cairo", # Default for this study
        "name": clean_val(data.get("Name")),
        "phone": clean_val(data.get("Phone")),
    }
    
    # 2. Purchase Funnel in Platform Format (__structured.purchase_funnel)
    pf_structured = {
        "pf_q1": clean_val(data.get(PF_MAPPING["tom"])),
        "pf_q2": get_slots(data, PF_MAPPING["unaided"]),
        "pf_q3": get_slots(data, PF_MAPPING["aided"]),
        "pf_q4": get_slots(data, PF_MAPPING["trial"]),
        "pf_q5": get_slots(data, PF_MAPPING["consideration"]),
        "pf_q6": get_slots(data, PF_MAPPING["repurchase_p12m"]),
        "pf_q7": clean_val(data.get(PF_MAPPING["mou"])),
    }
    
    # 3. Taste Test in "Gold" Format (flat_evaluations)
    flat_evals = []
    
    def add_evals(brand, scores, group):
        for attr, val in scores.items():
            flat_evals.append({
                "brand": brand,
                "attribute": attr,
                "metric": attr, # Platform usually uses attr as metric if not split
                "value": val,
                "group": group,
                "question_id": f"tt_{attr.lower().replace(' ', '_')}"
            })

    # Rotation Logic
    r1_brand = clean_val(data.get("FirstRotationBrand"))
    if r1_brand == BRAND_ABU_AUF:
        # Abu Auf (R1) -> Hero (R2)
        scores_abu = get_scores_for_set(data, 0)
        if scores_abu: add_evals(BRAND_ABU_AUF, scores_abu, "rotation_1")
        scores_hero = get_scores_for_set(data, 1)
        if scores_hero: add_evals(BRAND_HERO, scores_hero, "rotation_2")
    elif r1_brand == BRAND_HERO:
        # Hero (R1) -> Abu Auf (R3)
        scores_hero = get_scores_for_set(data, 1)
        if scores_hero: add_evals(BRAND_HERO, scores_hero, "rotation_1")
        scores_abu = get_scores_for_set(data, 2)
        if scores_abu: add_evals(BRAND_ABU_AUF, scores_abu, "rotation_2")

    # Overall Preference
    pref = clean_val(data.get("WhichIsFavorite"))
    pref_brand = BRAND_HERO if pref == "أبو عوف" else BRAND_ABU_AUF # Wait, let's be careful with mapping
    # The favorite question mapping is tricky, but let's use the raw string if unsure
    
    answers["__structured"] = {
        "flat_evaluations": flat_evals,
        "purchase_funnel": pf_structured,
        "overall": {"preference": pref},
        "question_map": {f"tt_{k.lower().replace(' ', '_')}": {"text": k, "attribute": k} for k in BASE_ATTRS.keys()}
    }
    
    doc = {
        "respondent_id": respondent_id,
        "token": f"TOKEN-{respondent_id}", # Generate a dummy token to satisfy DirectIngestor
        "survey_id": SURVEY_ID,
        "status": "completed",
        "created_at": datetime.now(timezone.utc),
        "submitted_at": datetime.now(timezone.utc),
        "answers": answers
    }

    return doc

# --- Main Logic ---

def build_metadata():
    return {
        "survey_id": SURVEY_ID,
        "title": "Hero Protein Bar Taste Test (Legacy)",
        "category": "Protein Bars",
        "brands": [BRAND_HERO, BRAND_ABU_AUF],
        "flavors": ["زبدة فول سوداني", "براونيز"],
        "target_brand": BRAND_HERO,
        "mock_prices": MOCK_PRICES,
        "purchase_funnel_steps": [
            {"id": "tom", "label": "Top of Mind"},
            {"id": "unaided", "label": "Unaided Awareness"},
            {"id": "aided", "label": "Aided Awareness"},
            {"id": "trial", "label": "Ever Trial"},
            {"id": "consideration", "label": "Consideration (P6M)"},
            {"id": "repurchase_p12m", "label": "Repurchase (P3M)"},
            {"id": "mou", "label": "Most Often Used"}
        ],
        "taste_test_attributes": list(BASE_ATTRS.keys()) + ["Essence"],
        "updated_at": datetime.now(timezone.utc)
    }

async def run_etl(csv_path: str, mongo_uri: str, db_name: str, drop: bool, dry_run: bool):
    logger.info(f"Starting Logical ETL: {csv_path} -> {db_name}")
    if not os.path.exists(csv_path): return
    df = pd.read_csv(csv_path)
    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]
    responses_col = db["responses"]
    metadata_col = db["survey_metadata"]

    # 0. Register in Platform Registry
    # Using the template ID found in the system
    TEMPLATE_ID = "69a00641461d731e3134a134" 
    platform_survey_id = await ensure_survey_registry(db, TEMPLATE_ID, "admin")
    logger.info(f"Registered survey in platform with DB ID: {platform_survey_id}")

    if dry_run:
        for i in range(min(2, len(df))):
            doc = transform_row(i, df.iloc[i])
            import json
            from bson import json_util
            json_str = json.dumps(doc, indent=2, default=json_util.default, ensure_ascii=False)
            try: print(f"\n--- RESPONDENT {i+1} ---\n"); print(json_str)
            except: sys.stdout.buffer.write(json_str.encode('utf-8'))
        return

    if drop:
        logger.info(f"Dropping existing data for survey_id: {platform_survey_id}")
        await responses_col.delete_many({"survey_id": platform_survey_id})
        await metadata_col.delete_many({"survey_id": SURVEY_ID})

    # 1. Insert Metadata
    logger.info("Upserting survey metadata...")
    meta_doc = build_metadata()
    await metadata_col.update_one(
        {"survey_id": SURVEY_ID},
        {"$set": meta_doc},
        upsert=True
    )

    # 2. Transform and Batch Upsert Responses
    logger.info("Transforming respondents...")
    ops = []
    for i, row in df.iterrows():
        try:
            doc = transform_row(i, row)
            # Link to the platform survey ID
            doc["survey_id"] = platform_survey_id
            
            ops.append(UpdateOne(
                {"respondent_id": doc["respondent_id"], "survey_id": platform_survey_id},
                {"$set": doc},
                upsert=True
            ))
            
            if len(ops) >= 100:
                await responses_col.bulk_write(ops)
                logger.info(f"Processed {i+1} rows...")
                ops = []
        except Exception as e:
            logger.error(f"Error row {i}: {e}")

    if ops:
        await responses_col.bulk_write(ops)
        logger.info(f"Final batch complete. Total: {len(df)} rows.")

    # 3. Create Indexes
    logger.info("Ensuring indexes...")
    await responses_col.create_index("survey_id")
    await metadata_col.create_index("survey_id", unique=True)
    await responses_col.create_index("taste_test.rotations.brand")
    logger.info("ETL COMPLETE!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="Hero_data (2).csv")
    parser.add_argument("--mongo", default="mongodb://localhost:27018")
    parser.add_argument("--db", default="survey_platform")
    parser.add_argument("--drop", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_etl(args.csv, args.mongo, args.db, args.drop, args.dry_run))
