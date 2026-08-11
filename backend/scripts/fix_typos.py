import asyncio
from backend.database import db

async def fix():
    db.connect()
    
    # Fix the master module definition
    modules = db.get_collection('question_modules')
    async for mod in modules.find({'module_id': 'brand_usage'}):
        needs_update = False
        for sec in mod.get('sections', []):
            for q in sec.get('questions', []):
                if q.get('ar_text', '').startswith('ي العادي'):
                    q['ar_text'] = q['ar_text'].replace('ي العادي', 'في العادي', 1)
                    needs_update = True
                if q.get('options'):
                    for opt in q['options']:
                        if opt.get('ar_label', '').startswith('ي الخروجات'):
                            opt['ar_label'] = opt['ar_label'].replace('ي الخروجات', 'في الخروجات', 1)
                            needs_update = True
        if needs_update:
            await modules.update_one({'_id': mod['_id']}, {'$set': {'sections': mod['sections']}})
            print('Updated module:', mod['module_id'])
            
    # Fix any existing surveys that copied the typo
    surveys = db.get_collection('surveys')
    async for srv in surveys.find({}):
        needs_update = False
        
        for snapshot_key in ['template_snapshot_schema', 'template_snapshot_l2', 'template_snapshot_l3', 'template_snapshot_l4']:
            snapshot = srv.get(snapshot_key, {})
            if not snapshot: continue
            
            for sec in snapshot.get('sections', []):
                for q in sec.get('questions', []):
                    if q.get('ar_text', '').startswith('ي العادي'):
                        q['ar_text'] = q['ar_text'].replace('ي العادي', 'في العادي', 1)
                        needs_update = True
                    if q.get('options'):
                        for opt in q['options']:
                            if isinstance(opt, dict) and opt.get('ar_label', '').startswith('ي الخروجات'):
                                opt['ar_label'] = opt['ar_label'].replace('ي الخروجات', 'في الخروجات', 1)
                                needs_update = True
                                
            if needs_update:
                await surveys.update_one({'_id': srv['_id']}, {'$set': {snapshot_key: snapshot}})
                print(f"Fixed typo in survey {srv.get('survey_code', srv['_id'])} ({snapshot_key})")
                needs_update = False
    
    print("Fix complete!")

asyncio.run(fix())
