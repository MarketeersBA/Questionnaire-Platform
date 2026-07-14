from backend.config import settings
from backend.database import db
from backend.models import UserCreate
from backend.utils.security import get_password_hash
from backend.utils.logging_utils import logger
from datetime import datetime

async def seed_admin():
    """
    Ensure the admin user exists in the database on startup.
    Uses credentials from environment variables.
    """
    users_col = db.get_collection("users")
    
    # Check if admin already exists
    admin = await users_col.find_one({"username": settings.ADMIN_USERNAME})
    
    if not admin:
        logger.info(f"Seeding initial admin user: {settings.ADMIN_USERNAME}")
        hashed_pw = get_password_hash(settings.ADMIN_PASSWORD)
        doc = {
            "username": settings.ADMIN_USERNAME,
            "email": "admin@marketeers.com",
            "is_active": True,
            "role": "admin",
            "hashed_password": hashed_pw,
            "created_at": datetime.utcnow()
        }
        await users_col.insert_one(doc)
        logger.info("Admin user seeded successfully")
    else:
        current_role = admin.get("role")
        logger.info(f"Admin user {settings.ADMIN_USERNAME} already exists. Current role: {current_role}")
        # Ensure role is set correctly even for existing user
        if current_role != "admin":
            await users_col.update_one(
                {"username": settings.ADMIN_USERNAME},
                {"$set": {"role": "admin"}}
            )
            logger.info(f"Updated user {settings.ADMIN_USERNAME} role to admin from {current_role}")
        else:
            logger.info(f"Admin user {settings.ADMIN_USERNAME} confirmed with role: admin")
