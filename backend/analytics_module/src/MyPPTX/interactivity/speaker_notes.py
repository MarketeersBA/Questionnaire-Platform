import logging
from typing import List, Dict, Any
from backend.analytics_module.chart_insight_engine import ChartInsightEngine
from backend.models import ChartPayload # Assuming this matches our ChartDefinition enough

logger = logging.getLogger(__name__)

class SpeakerNotesHandler:
    """
    Advanced Embellishment Engine: AI Speaker Notes.
    Utilizes the AI Insight Engine to provide "Secret" analytical cues 
    in the presentation's notes layer.
    """

    @staticmethod
    def inject_strategic_notes(slide, headline: str, analysis_points: List[Dict[str, Any]]):
        """
        Populates the slide's speaker notes with the high-fidelity AI takeaways.
        """
        if not slide.has_notes_slide:
            notes_slide = slide.notes_slide
        else:
            notes_slide = slide.notes_slide
            
        tf = notes_slide.notes_text_frame
        
        # Format for executive clarity:
        # STRATEGIC SUMMARY: [Headline]
        # KEY ANALYSIS:
        # - Point 1: Body
        # - Point 2: Body
        
        full_text = f"STRATEGIC SUMMARY:\n{headline}\n\nKEY ANALYSIS:\n"
        for point in analysis_points:
            title = point.get("title", "Insight").upper()
            body = point.get("body", "")
            full_text += f"• {title}: {body}\n"
            
        tf.text = full_text
        logger.info(f"[SpeakerNotes] Injected AI insights into slide.")

    @staticmethod
    def format_three_sentence_takeaway(headline: str, analysis_points: List[Dict[str, Any]]) -> str:
        """
        Collapses complex AI JSON into a concise 3-sentence executive takeaway.
        """
        points = [p.get("body", "") for p in analysis_points][:2]
        return f"{headline} {' '.join(points)}"
