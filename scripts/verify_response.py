import motor.motor_asyncio
import asyncio

async def count_responses():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    # Total responses for this survey
    count = await db.responses.count_documents({"survey_id": "6a378d82c83ed3f89174cee6"})
    print(f"Total responses: {count}")
    
    # Specific response for this token
    token_resp = await db.responses.find_one({"token": "CCFC6CE9-FA9", "source": "in_app_gateway"})
    if token_resp:
        print("Final response found in database.")
    else:
        print("Final response NOT found.")

if __name__ == "__main__":
    asyncio.run(count_responses())
