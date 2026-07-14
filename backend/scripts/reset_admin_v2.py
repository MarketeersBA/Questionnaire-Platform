
import asyncio
import os
from backend.database import db
from backend.utils.security import get_password_hash

async def reset_admin():
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "admin123")
    
    print(f"Updating user '{username}' inside Docker...")
    hashed_pw = get_password_hash(password)
    
    users_col = db.get_collection("users")
    await users_col.update_one(
        {"username": username},
        {"$set": {
            "hashed_password": hashed_pw,
            "role": "admin",
            "is_active": True
        }},
        upsert=True
    )
    print("Admin update complete.")

if __name__ == "__main__":
    db.connect()
    asyncio.run(reset_admin())
    db.close()
