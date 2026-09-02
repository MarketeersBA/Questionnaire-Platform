import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db

async def main():
    db.connect()
    try:
        responses = await db.get_collection("survey_responses").find({"survey_id": "6a3b8939b3fa5ef1308239ed"}).to_list(length=None)
        
        vals = []
        for r in responses:
            for eval_item in r.get("product_evaluations", []):
                for k, v in eval_item.get("scale_evaluations", {}).items():
                    vals.append(v)
        print("Unique values:", set(vals))
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
