import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

async def create_indexes():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.DATABASE_NAME]
    
    # Templates Indexes
    templates_col = db.get_collection("templates")
    await templates_col.create_index([("name", 1), ("version", 1)], unique=True)
    await templates_col.create_index("is_deleted")
    
    # Tokens Indexes
    tokens_col = db.get_collection("tokens")
    await tokens_col.create_index("token", unique=True)
    await tokens_col.create_index("status")
    await tokens_col.create_index("survey_id")
    await tokens_col.create_index("created_at")
    await tokens_col.create_index("last_accessed")
    
    # Surveys Indexes
    surveys_col = db.get_collection("surveys")
    await surveys_col.create_index("template_id")
    await surveys_col.create_index("status")

    # Orphan Submissions Indexes
    orphans_col = db.get_collection("orphan_submissions")
    await orphans_col.create_index("timestamp")
    await orphans_col.create_index("reason")

    # Respondents Indexes
    respondents_col = db.get_collection("respondents")
    await respondents_col.create_index("phone", unique=True)
    await respondents_col.create_index("created_at")
    
    # Attribute Banks Indexes
    banks_col = db.get_collection("attribute_banks")
    await banks_col.create_index([("category", 1), ("version", -1)], unique=True)
    await banks_col.create_index("category")

    # Taste Test Configs Indexes
    configs_col = db.get_collection("taste_test_configs")
    await configs_col.create_index([("family_id", 1), ("version", -1)])
    await configs_col.create_index([("created_by", 1), ("status", 1)])
    await configs_col.create_index("config_id")
    await configs_col.create_index("category")
    
    # Taste Test Questions Indexes
    tt_q_col = db.get_collection("taste_test_questions")
    await tt_q_col.create_index("question_id", unique=True)
    await tt_q_col.create_index("legacy_id")
    await tt_q_col.create_index([("main_att", 1), ("question_status", 1)])

    # Master Questions Indexes
    master_q_col = db.get_collection("master_questions")
    await master_q_col.create_index("question_id", unique=True)
    await master_q_col.create_index("section")
    await master_q_col.create_index("main_attribute")

    # Question Modules Indexes
    modules_col = db.get_collection("question_modules")
    await modules_col.create_index([("module_id", 1), ("version", 1)], unique=True)
    await modules_col.create_index([("module_id", 1), ("is_active", 1)])
    await modules_col.create_index("is_active")
    
    print("Successfully created MongoDB indexes.")
    client.close()

if __name__ == "__main__":
    asyncio.run(create_indexes())
