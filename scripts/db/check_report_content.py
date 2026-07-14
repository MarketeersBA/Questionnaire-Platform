import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def check_report_charts():
    client = AsyncIOMotorClient("mongodb://localhost:27018")
    db = client["survey_platform"]
    
    report_id = "69d3aeb468f389e465151c53"
    report = await db.survey_reports.find_one({"_id": ObjectId(report_id)})
    
    if not report:
        print(f"Report {report_id} not found")
        return
    
    print(f"Report found: {report.get('project_name')}")
    charts = report.get("charts", [])
    print(f"Number of charts: {len(charts)}")
    
    for i, chart in enumerate(charts):
        print(f"[{i}] chart_id: {chart.get('chart_id')} | title: {chart.get('title')}")
        if 'data' in chart:
             d = chart['data']
             if isinstance(d, list):
                 print(f"    Data items: {len(d)}")
             elif isinstance(d, dict):
                 print(f"    Data keys: {list(d.keys())}")

    opps = report.get("insights", {}).get("opportunity_insights", [])
    print(f"Opportunity insights: {len(opps)}")

if __name__ == "__main__":
    asyncio.run(check_report_charts())
