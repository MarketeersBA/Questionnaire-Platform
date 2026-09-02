import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        col = db.get_collection("survey_reports")
        report = await col.find_one({"survey_id": "6a3b8939b3fa5ef1308239ed"})
        if report:
            print("Keys:", list(report.keys()))
        else:
            print("No report found!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
