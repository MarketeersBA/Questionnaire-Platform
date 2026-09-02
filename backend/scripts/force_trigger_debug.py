import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        surveys_col = db.get_collection("surveys")
        surveys = await surveys_col.find({}).to_list(None)
        print("Surveys:", [(s['_id'], s.get('company_name')) for s in surveys])
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
