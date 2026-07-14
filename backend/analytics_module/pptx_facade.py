import logging
import os
from pathlib import Path
from datetime import datetime
import asyncio
from typing import Dict, Any

from pptx import Presentation
from backend.analytics_module.config_loader import load_app_config
from backend.analytics_module.src.MyPPTX import design_config

logger = logging.getLogger(__name__)

class PPTXGenerator:
    """
    Facade for generating high-fidelity PowerPoint presentations from 
    structured report data. Implements a Queue-aware state machine.
    """
    
    def __init__(self, db, survey_id: str):
        self.db = db
        self.survey_id = survey_id
        # Resource alignment
        self.resource_dir = Path("backend/resources/analytics")
        self.output_dir = Path("backend/reports") 
        self.template_path = self.resource_dir / "template.pptx"
        
        os.makedirs(self.output_dir, exist_ok=True)

    async def _update_status(self, status: str, progress: int = 0):
        """Emulates a Celery/Redis status update for the UI progress bar."""
        await self.db.get_collection("survey_reports").update_one(
            {"survey_id": self.survey_id},
            {"$set": {
                "pptx_status": status,
                "pptx_progress": progress,
                "pptx_last_update": datetime.now()
            }}
        )
        logger.info(f"[PPTX-Queue] {self.survey_id} changed to {status} ({progress}%)")

    async def generate_from_report(self, report_doc: Dict[str, Any]) -> str:
        """
        Main entry point. Orchestrates the full lifecycle using the NEW V2 Engine.
        """
        await self._update_status("PROCESSING", 5)
        
        try:
            from backend.analytics_module.pptx_builder.engine import PPTXEngine
            
            # Map legacy 'project_name' to V2 'title' in metadata if missing
            if "metadata" not in report_doc:
                report_doc["metadata"] = {
                    "title": report_doc.get("project_name", "Analysis"),
                    "brand": report_doc.get("brand", "Client")
                }
            
            # 1. Initialize Engine (Uses marketeers_template.pptx by default)
            engine = PPTXEngine()
            await self._update_status("PROCESSING", 20)
            
            # 2. Plan the Presentation (Structural Parity)
            from backend.analytics_module.pptx_builder.presentation_planner import PresentationPlanner
            intents = PresentationPlanner.define_slide_intents(report_doc)
            
            # 3. Generate Presentation Stream
            loop = asyncio.get_event_loop()
            pptx_stream, actual_count = await loop.run_in_executor(None, engine.generate_presentation, intents)
            
            await self._update_status("PROCESSING", 80)

            # 3. Save & Finalize
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"Report_{self.survey_id}_{timestamp}.pptx"
            output_path = self.output_dir / filename
            
            with open(output_path, "wb") as f:
                f.write(pptx_stream.read())
            
            # Finalize Status
            await self._update_status("READY", 100)
            return str(output_path.absolute())

        except Exception as e:
            logger.error(f"[PPTXGenerator] Pipeline Failure: {e}", exc_info=True)
            await self._update_status("FAILED", 0)
            return ""


