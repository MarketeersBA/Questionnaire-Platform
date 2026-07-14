import asyncio
from backend.database import db

async def run():
    pt = db.get_collection('product_test_questions')
    c = await pt.count_documents({})
    f = await pt.count_documents({'question_status': 'fixed'})
    print(f'Total={c}, Fixed={f}')

if __name__ == '__main__':
    asyncio.run(run())
