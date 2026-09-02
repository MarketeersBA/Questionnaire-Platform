import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        banks = await db.get_collection("attribute_banks").find({}).to_list(length=1)
        if banks:
            print(banks[0])
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
