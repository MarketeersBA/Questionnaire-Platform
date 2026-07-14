from pymongo import MongoClient

def hydrate():
    client = MongoClient('mongodb://localhost:27018')
    db = client.survey_platform
    db.surveys.update_many({'created_by': {'$exists': False}}, {'$set': {'created_by': 'admin'}})
    print('Updated missing created_by fields.')

if __name__ == "__main__":
    hydrate()
