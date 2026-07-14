import asyncio
from backend.analytics_module.pptx_generator_v2 import PPTXGeneratorV2
from backend.database import db

async def test():
    db.connect()
    g = PPTXGeneratorV2(db.db)
    # 69d3aeb468f389e465151c53 was the report ID from mongo earlier
    path = await g.generate('69d3aeb468f389e465151c53')
    print("Generated at:", path)
    
if __name__ == "__main__":
    asyncio.run(test())
