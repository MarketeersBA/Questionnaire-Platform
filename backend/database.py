from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

    def connect(self):
        self.client = AsyncIOMotorClient(settings.MONGO_URI)
        self.db = self.client[settings.DATABASE_NAME]

    def close(self):
        self.client.close()

    def get_collection(self, collection_name: str):
        return self.db[collection_name]

    def get_gridfs_bucket(self, bucket_name: str = "voice_recordings"):
        from motor.motor_asyncio import AsyncIOMotorGridFSBucket
        return AsyncIOMotorGridFSBucket(self.db, bucket_name=bucket_name)

    def get_packaging_images_bucket(self):
        """GridFS bucket dedicated to product packaging heatmap images."""
        return self.get_gridfs_bucket("packaging_images")

    def get_product_test_media_bucket(self):
        """GridFS bucket for respondent product trial photo/video uploads."""
        return self.get_gridfs_bucket("product_test_media")

    async def ensure_indexes(self):
        """Create required indexes for all collections. Idempotent — safe to call on every startup."""
        try:
            surveys_col = self.get_collection("surveys")
            await surveys_col.create_index("is_deleted")
            await surveys_col.create_index("created_at")

            reports = self.get_collection("survey_reports")
            await reports.create_index("survey_id", unique=True)
            await reports.create_index("status")
            await reports.create_index("generated_at")
            
            voice = self.get_collection("voice_feedbacks")
            await voice.create_index([("survey_id", 1), ("question_id", 1)])
            await voice.create_index("created_at")
            await voice.create_index("status")
            
            modules = self.get_collection("question_modules")
            await modules.create_index([("module_id", 1), ("version", 1)], unique=True)
            await modules.create_index([("module_id", 1), ("is_active", 1)])
            await modules.create_index("is_active")

            sessions = self.get_collection("survey_sessions")
            await sessions.create_index("token", unique=True)
            await sessions.create_index("last_updated")

            heatmap_agg = self.get_collection("packaging_heatmap_aggregates")
            await heatmap_agg.create_index([("survey_id", 1), ("question_id", 1)], unique=True)
            await heatmap_agg.create_index("survey_id")

            pt_media = self.get_collection("product_test_media_assets")
            await pt_media.create_index("asset_id", unique=True)
            await pt_media.create_index([("token", 1), ("question_id", 1)])
            await pt_media.create_index([("survey_id", 1), ("token", 1)])
            await pt_media.create_index("uploaded_at")
            await pt_media.create_index([("lifecycle_state", 1), ("uploaded_at", 1)])
            await pt_media.create_index([("survey_id", 1), ("lifecycle_state", 1)])
            await pt_media.create_index("scan_status")

            pt_media_files = self.get_collection("product_test_media.files")
            await pt_media_files.create_index("metadata.survey_id")
            await pt_media_files.create_index("metadata.token")
            await pt_media_files.create_index("metadata.question_id")
            await pt_media_files.create_index("uploadDate")
            await pt_media_files.create_index([
                ("metadata.survey_id", 1),
                ("metadata.token", 1),
            ])

            logger.info(
                "Database indexes ensured for survey_reports, voice_feedbacks, question_modules, "
                "survey_sessions, packaging_heatmap_aggregates, product_test_media_assets, "
                "product_test_media.files"
            )
        except Exception as e:
            err = str(e)
            if "duplicate key" in err.lower() or "E11000" in err:
                logger.warning(
                    "survey_reports.survey_id unique index could not be created — "
                    "duplicate survey_id rows exist. Run: "
                    "python -m backend.scripts.cleanup_duplicate_survey_reports --dry-run "
                    "then --apply --recreate-index | error=%s",
                    e,
                )
            else:
                logger.warning("Index creation skipped or failed: %s", e)

db = Database()

def get_database():
    """Helper for services to get the Motor database object."""
    return db.db
