from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId

from backend.database import db
from backend.models import User
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/voice-dashboard", tags=["voice-dashboard"])

@router.get("/{survey_id}/summary")
async def get_dashboard_summary(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Overall metrics for the voice feedback system."""
    collection = db.get_collection("voice_feedbacks")
    
    total = await collection.count_documents({"survey_id": survey_id})
    completed = await collection.count_documents({"survey_id": survey_id, "status": "completed"})
    
    # Simple sentiment aggregate
    cursor = collection.aggregate([
        {"$match": {"survey_id": survey_id, "status": "completed"}},
        {"$group": {"_id": "$nlp_result.sentiment", "count": {"$sum": 1}}}
    ])
    
    sentiment_data = {}
    async for item in cursor:
        sentiment_data[item["_id"]] = item["count"]
        
    return {
        "total_feedbacks": total,
        "completed_analysis": completed,
        "sentiment_distribution": sentiment_data,
        "processing_rate": round((completed / total * 100), 1) if total > 0 else 0
    }

@router.get("/{survey_id}/sentiment-trend")
async def get_sentiment_trend(
    survey_id: str,
    days: int = 30,
    current_user: User = Depends(get_current_user)
):
    """Time-series sentiment data for area charts."""
    collection = db.get_collection("voice_feedbacks")
    start_date = datetime.utcnow() - timedelta(days=days)
    
    cursor = collection.aggregate([
        {"$match": {
            "survey_id": survey_id, 
            "status": "completed",
            "created_at": {"$gte": start_date}
        }},
        {"$project": {
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "sentiment": "$nlp_result.sentiment"
        }},
        {"$group": {
            "_id": {"date": "$date", "sentiment": "$sentiment"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.date": 1}}
    ])
    
    trend = {}
    async for item in cursor:
        date = item["_id"]["date"]
        sentiment = item["_id"]["sentiment"]
        if date not in trend:
            trend[date] = {"date": date, "positive": 0, "negative": 0, "neutral": 0}
        trend[date][sentiment] = item["count"]
        
    return sorted(list(trend.values()), key=lambda x: x["date"])

@router.get("/{survey_id}/aspect-matrix")
async def get_aspect_matrix(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cross-tab data for Aspect Heatmap (Aspect vs Sentiment)."""
    collection = db.get_collection("voice_feedbacks")
    
    cursor = collection.aggregate([
        {"$match": {"survey_id": survey_id, "status": "completed"}},
        {"$unwind": "$nlp_result.aspects"},
        {"$group": {
            "_id": {
                "aspect": "$nlp_result.aspects.aspect",
                "sentiment": "$nlp_result.aspects.sentiment"
            },
            "count": {"$sum": 1}
        }}
    ])
    
    matrix = []
    async for item in cursor:
        matrix.append({
            "aspect": item["_id"]["aspect"],
            "sentiment": item["_id"]["sentiment"],
            "count": item["count"]
        })
        
    return matrix

@router.get("/{survey_id}/clusters")
async def get_clusters(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """List of discovered clusters with their metadata."""
    # Note: Phase 4 store clusters in a separate collection or we compute on the fly
    # Here we assume a 'feedback_clusters' collection exists
    collection = db.get_collection("feedback_clusters")
    cursor = collection.find({"survey_id": survey_id}).sort("size", -1)
    
    clusters = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        clusters.append(doc)
    return clusters

@router.get("/{survey_id}/top-complaints")
async def get_top_complaints(
    survey_id: str,
    limit: int = 5,
    current_user: User = Depends(get_current_user)
):
    """Top N negative clusters."""
    collection = db.get_collection("feedback_clusters")
    cursor = collection.find({
        "survey_id": survey_id,
        "dominant_sentiment": "negative"
    }).sort("size", -1).limit(limit)
    
    complaints = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        complaints.append(doc)
    return complaints

@router.get("/{survey_id}/satisfaction-drivers")
async def get_satisfaction_drivers(
    survey_id: str,
    limit: int = 5,
    current_user: User = Depends(get_current_user)
):
    """Top N positive aspects extracted from the NLP pipeline."""
    collection = db.get_collection("voice_feedbacks")
    
    cursor = collection.aggregate([
        {"$match": {"survey_id": survey_id, "status": "completed"}},
        {"$unwind": "$nlp_result.aspects"},
        {"$match": {"nlp_result.aspects.sentiment": "positive"}},
        {"$group": {
            "_id": "$nlp_result.aspects.aspect",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit}
    ])
    
    drivers = []
    async for item in cursor:
        drivers.append({"aspect": item["_id"], "count": item["count"]})
    return drivers

@router.get("/{survey_id}/feedbacks")
async def get_filtered_feedbacks(
    survey_id: str,
    sentiment: Optional[str] = None,
    aspect: Optional[str] = None,
    intent: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Detailed feedback list with filters for the dashboard timeline."""
    query = {"survey_id": survey_id, "status": "completed"}
    if sentiment:
        query["nlp_result.sentiment"] = sentiment
    if aspect:
        query["nlp_result.aspects.aspect"] = aspect
    if intent:
        query["nlp_result.intent"] = intent
        
    collection = db.get_collection("voice_feedbacks")
    total = await collection.count_documents(query)
    
    cursor = collection.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(doc)
        
    return {
        "total": total,
        "items": items,
        "page": page,
        "limit": limit
    }

@router.get("/{survey_id}/report")
async def get_report(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Retrieve the latest synthesized business report."""
    collection = db.get_collection("feedback_reports")
    report = await collection.find_one({"survey_id": survey_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated yet")
    report["id"] = str(report.pop("_id"))
    return report

@router.get("/{survey_id}/alerts")
async def get_alerts(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Retrieve active alerts for the survey."""
    collection = db.get_collection("voice_alerts")
    cursor = collection.find({"survey_id": survey_id, "is_resolved": False}).sort("detected_at", -1)
    alerts = []
    async for a in cursor:
        a["id"] = str(a.pop("_id"))
        alerts.append(a)
    return alerts
