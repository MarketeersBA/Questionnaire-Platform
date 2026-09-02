import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        responses = await db.get_collection("survey_responses").find({"survey_id": "6a3b8939b3fa5ef1308239ed"}).to_list(length=1)
        
        if responses:
            for k in responses[0].keys():
                print(k)
            print("product_evaluations:", responses[0].get("product_evaluations", []))
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
