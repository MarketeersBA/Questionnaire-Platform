import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.database import db
from backend.analytics_module.aggregator import ReportAggregator

async def main():
    db.connect()
    try:
        report = await db.get_collection("survey_reports").find_one({"survey_id": "69f86a4564a3943cd07f8cc6"}, sort=[("generated_at", -1)])
        survey = await db.get_collection("surveys").find_one({"_id": "69f86a4564a3943cd07f8cc6"})
        responses = await db.get_collection("survey_responses").find({"survey_id": "69f86a4564a3943cd07f8cc6"}).to_list(length=None)
        
        agg = ReportAggregator(survey, responses)
        df = agg.data.scale_evaluations
        
        print("max_val:", df["value"].max())
        print("dtypes:", df["value"].dtype)
        print("unique values:", df["value"].unique())
        
        numeric_vals = __import__('pandas').to_numeric(df["value"], errors='coerce').dropna()
        print("numeric values count:", len(numeric_vals))
        if len(numeric_vals) > 0:
            print("numeric max:", numeric_vals.max())
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(main())
