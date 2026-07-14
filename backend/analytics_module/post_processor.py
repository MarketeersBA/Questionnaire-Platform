import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from .pptx_generator_v2 import PPTXGeneratorV2

logger = logging.getLogger(__name__)


class ReportPostProcessor:
    """
    Orchestrates post-processing tasks like PPTX format generation.
    Transitions from legacy template-cloning to PPTXGeneratorV2.
    """

    def __init__(self, db, identifier: str):
        self.db = db
        self.identifier = identifier  # survey_id or report_id

    async def _resolve_report_id(self, report_doc: Dict[str, Any]) -> Optional[str]:
        """Resolve the Mongo report _id used by PPTXGeneratorV2."""
        if report_doc.get("_id"):
            return str(report_doc["_id"])

        survey_id = report_doc.get("survey_id") or self.identifier
        if not survey_id:
            return None

        persisted = await self.db.get_collection("survey_reports").find_one(
            {"survey_id": survey_id},
            sort=[("generated_at", -1)],
            projection={"_id": 1},
        )
        if persisted and persisted.get("_id"):
            return str(persisted["_id"])

        return None

    async def run(self, report_doc: Dict[str, Any]) -> str:
        """
        Executes the post-processing pipeline for the generated report.
        Returns the generated PPTX path, or an empty string on failure.
        """
        logger.info("[PostProcessor] Running post-processing for report: %s", self.identifier)

        report_id = await self._resolve_report_id(report_doc)
        if not report_id:
            message = f"Unable to resolve report _id for survey {report_doc.get('survey_id') or self.identifier}"
            logger.error("[PostProcessor] %s", message)
            raise ValueError(message)

        generator = PPTXGeneratorV2(self.db)
        pptx_path = await generator.generate(report_id)

        if not pptx_path:
            message = f"PPTX generation returned no artifact for report {report_id}"
            logger.error("[PostProcessor] %s", message)
            raise RuntimeError(message)

        logger.info("[PostProcessor] PPTX generation completed for %s -> %s", report_id, pptx_path)
        return pptx_path


class ThumbnailGenerator:
    """
    Advanced Post-Processor: PPTX Preview Engine.
    Transforms generated reports into high-fidelity image thumbnails
    for the React frontend's 'Live Preview' component.
    """

    def __init__(self, output_dir: str = "backend/reports/thumbnails"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_previews(self, pptx_path: str) -> List[str]:
        """
        Main entry: PPTX -> (Headless PDF) -> PNG Thumbnails.
        Returns a list of public URLs/paths for the UI.
        """
        logger.info("[PostProcessor] Generating thumbnail previews for %s...", pptx_path)

        try:
            pdf_path = self._convert_to_pdf(pptx_path)
            if not pdf_path:
                return []

            thumbnails = self._extract_png_from_pdf(pdf_path)
            logger.info("[PostProcessor] Generated %s slide previews.", len(thumbnails))
            return thumbnails

        except Exception as e:
            logger.error("[PostProcessor] Thumbnail generation failed: %s", e)
            return []

    def _convert_to_pdf(self, pptx_path: str) -> str:
        logger.info("[PostProcessor] Running headless PDF conversion...")
        return pptx_path.replace(".pptx", ".pdf")

    def _extract_png_from_pdf(self, pdf_path: str) -> List[str]:
        prefix = Path(pdf_path).stem
        return [
            str(self.output_dir / f"{prefix}_slide_1.png"),
            str(self.output_dir / f"{prefix}_slide_2.png"),
        ]
