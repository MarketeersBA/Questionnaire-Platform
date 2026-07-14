import motor.motor_asyncio
import asyncio

async def check_token():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27018')
    db = client.survey_platform
    token_doc = await db.tokens.find_one({"token": "CCFC6CE9-FA9"})
    if token_doc:
        print(f"Token found: {token_doc}")
    else:
        print("Token NOT found")

if __name__ == "__main__":
    asyncio.run(check_token())
