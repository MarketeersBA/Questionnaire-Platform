from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from backend.models import MongoBaseModel

class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str
    confidence: float
    language: Optional[str] = None

class TranscriptionResult(BaseModel):
    text: str
    language: str
    confidence: float
    duration_s: float
    segments: List[TranscriptionSegment] = Field(default_factory=list)

class NLPAnalysisResult(BaseModel):
    sentiment: str  # positive, negative, neutral
    sentiment_scores: Dict[str, float]
    aspects: List[Dict[str, Any]] = Field(default_factory=list) # {aspect: str, sentiment: str, mention: str}
    intent: str  # complaint, suggestion, praise, other
    confidence: float

class VoiceFeedbackBase(BaseModel):
    survey_id: str
    question_id: str
    token: str
    audio_grid_id: Optional[str] = None
    transcript: Optional[str] = None
    normalized_text: Optional[str] = None
    language: Optional[str] = None
    duration_s: Optional[float] = None
    status: str = "pending" # pending, processing, completed, failed
    error_message: Optional[str] = None

class VoiceFeedback(VoiceFeedbackBase, MongoBaseModel):
    stt_result: Optional[TranscriptionResult] = None
    nlp_result: Optional[NLPAnalysisResult] = None
    cost_usd: float = 0.0
    token_usage: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None

class FeedbackCluster(MongoBaseModel):
    survey_id: str
    question_id: str
    label: str
    centroid: List[float]
    member_count: int
    representative_quotes: List[str] = Field(default_factory=list)
    dominant_sentiment: str = "neutral"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AlertConfig(BaseModel):
    survey_id: str
    neg_spike_window_h: int = 24
    neg_spike_threshold_pct: float = 50.0
    is_active: bool = True

class AlertEvent(MongoBaseModel):
    survey_id: str
    severity: str # info, warning, critical
    message: str
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    is_resolved: bool = False
