import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("InitAICache")

async def init_indexes():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.DATABASE_NAME]
    collection = db["ai_insight_cache"]

    logger.info("Setting up indexes for 'ai_insight_cache' collection...")

    # 1. Compound Unique Index for fast, collision-free lookups
    # Ensures we don't have duplicate insights for the same component in the same survey
    unique_index_name = await collection.create_index(
        [
            ("survey_id", 1),
            ("component_type", 1),
            ("component_key", 1),
            ("prompt_version", 1)  # Versioning support
        ],
        unique=True,
        name="unique_survey_component_version"
    )
    logger.info(f"Created unique index: {unique_index_name}")

    # 2. TTL Index for automatic expiration
    # Records with 'expires_at' will be automatically deleted when the date passes
    ttl_index_name = await collection.create_index(
        "expires_at",
        expireAfterSeconds=0,
        name="ttl_expiration"
    )
    logger.info(f"Created TTL index: {ttl_index_name}")

    # 3. Lookup support for survey cleanup
    await collection.create_index("survey_id", name="survey_lookup")
    
    logger.info("AI Insight Cache indexes initialized successfully.")
    client.close()

if __name__ == "__main__":
    asyncio.run(init_indexes())
