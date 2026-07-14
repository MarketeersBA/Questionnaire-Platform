from pymongo import MongoClient

def cleanup():
    client = MongoClient('mongodb://localhost:27018')
    db = client.survey_platform
    surveys_col = db.surveys
    
    pipeline = [
        {"$match": {"is_deleted": {"$ne": True}}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$company_name",
            "ids": {"$push": "$_id"},
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = list(surveys_col.aggregate(pipeline))
    deleted_count = 0
    for group in duplicates:
        ids_to_delete = group["ids"][:-1]
        surveys_col.update_many(
            {"_id": {"$in": ids_to_delete}},
            {"$set": {"is_deleted": True}}
        )
        deleted_count += len(ids_to_delete)
        print(f"Cleaned '{group['_id']}': deleted {len(ids_to_delete)} duplicates.")
    
    print(f"\nTotal Deleted {deleted_count} duplicates.")

if __name__ == "__main__":
    cleanup()
