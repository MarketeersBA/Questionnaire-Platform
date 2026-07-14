import os
import json
import boto3
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load environment variables from .env file
load_dotenv()

def load_aws_secrets(secret_name: str, region: str = "eu-west-1") -> dict:
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])

class Settings(BaseSettings):
    ENV: str = os.getenv("ENV", "development") # development | staging | production

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    MONGO_URI: str = os.getenv("MONGO_URI")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "survey_platform")

    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # Admin credentials
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD")
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # Redis Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6370")
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "3600")) # Default 1 hour

    # Analytics Configuration
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    ANALYTICS_RESOURCES_DIR: str = os.getenv("ANALYTICS_RESOURCES_DIR", "backend/resources/analytics")
    ANALYTICS_OUTPUT_DIR: str = os.getenv("ANALYTICS_OUTPUT_DIR", "out/reports")
    ANALYTICS_DEVELOPER_MODE: bool = os.getenv("ANALYTICS_DEVELOPER_MODE", "false").lower() == "true"

    # Voice Feedback Configuration
    WHISPER_MODE: str = os.getenv("WHISPER_MODE", "api") # "api" or "local"
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    MAX_AUDIO_DURATION_S: int = int(os.getenv("MAX_AUDIO_DURATION_S", "120"))
    MAX_AUDIO_FILE_MB: int = int(os.getenv("MAX_AUDIO_FILE_MB", "10"))
    VOICE_RESOURCES_DIR: str = os.getenv("VOICE_RESOURCES_DIR", "backend/resources/voice_feedback")

    # Packaging heatmap image uploads (product test)
    MAX_PACKAGING_IMAGE_MB: int = int(os.getenv("MAX_PACKAGING_IMAGE_MB", "5"))

    # Product test trial media uploads (respondent photo / video)
    MAX_PRODUCT_TEST_IMAGE_MB: int = int(os.getenv("MAX_PRODUCT_TEST_IMAGE_MB", "5"))
    MAX_PRODUCT_TEST_VIDEO_MB: int = int(os.getenv("MAX_PRODUCT_TEST_VIDEO_MB", "25"))
    MAX_PRODUCT_TEST_VIDEO_DURATION_S: int = int(os.getenv("MAX_PRODUCT_TEST_VIDEO_DURATION_S", "60"))

    # Trial media lifecycle + security (Phase 6)
    PRODUCT_TEST_MEDIA_ABANDONED_TTL_HOURS: int = int(
        os.getenv("PRODUCT_TEST_MEDIA_ABANDONED_TTL_HOURS", "24")
    )
    PRODUCT_TEST_MEDIA_UNREFERENCED_GRACE_HOURS: int = int(
        os.getenv("PRODUCT_TEST_MEDIA_UNREFERENCED_GRACE_HOURS", "1")
    )
    PRODUCT_TEST_MEDIA_SCAN_ENABLED: bool = (
        os.getenv("PRODUCT_TEST_MEDIA_SCAN_ENABLED", "false").lower() == "true"
    )
    PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN: bool = (
        os.getenv("PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN", "true").lower() == "true"
    )
    PRODUCT_TEST_MEDIA_BLOCK_PENDING_ANALYST: bool = (
        os.getenv("PRODUCT_TEST_MEDIA_BLOCK_PENDING_ANALYST", "true").lower() == "true"
    )
    PRODUCT_TEST_MEDIA_STARTUP_CLEANUP: bool = (
        os.getenv("PRODUCT_TEST_MEDIA_STARTUP_CLEANUP", "false").lower() == "true"
    )

    def load_secrets_override(self):
        """Override config fields from AWS Secrets Manager in production."""
        if self.is_production:
            try:
                secrets = load_aws_secrets("questioner/production/secrets")
                for key, value in secrets.items():
                    if hasattr(self, key):
                        setattr(self, key, value)
            except Exception as e:
                # Fallback or strict fail depending on deployment choices.
                # Usually in prod we strict-fail if secrets can't be loaded
                raise RuntimeError(f"Failed to load production secrets from AWS: {str(e)}")

    def __init__(self, **values):
        super().__init__(**values)
        self.load_secrets_override()
        critical_vars = ["MONGO_URI", "SECRET_KEY", "ADMIN_USERNAME", "ADMIN_PASSWORD"]
        missing = [v for v in critical_vars if not getattr(self, v)]
        if missing:
            raise ValueError(f"CRITICAL SECURITY ERROR: Missing required environment variables: {', '.join(missing)}")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
