import asyncio
import os
import sys
from bson import ObjectId

# Add the project root to sys.path
sys.path.append(os.getcwd())

from backend.database import db

async def main():
    db.connect()
    coll = db.get_collection('responses')
    indexes = await coll.index_information()
    print("Indexes in 'responses':")
    for name, info in indexes.items():
        print(f"  {name}: {info}")

if __name__ == "__main__":
    asyncio.run(main())
