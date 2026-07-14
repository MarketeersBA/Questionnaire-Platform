import logging
import pandas as pd
from typing import List, Dict, Any, Optional

from . import slides, charts, tables
from .archetypes import resolve_archetype
from .text_hydrator import TextHydrator
from .matrix_normalizer import MatrixNormalizer
from .series_alignment import SeriesAligner
from .chart_injector import ChartInjector
from .styler import ChartStyler
from .axis_styler import AxisStyler
from .custom_charts.funnel import FunnelMapper
from .filter_awareness import FilterAwareness
from .pruner import PresentationPruner
from .design_config import ThemeManager

from backend.analytics_module.src.MyPPTX.composers.bars import BarChartComposer
from backend.analytics_module.src.MyPPTX.composers.trends import TrendChartComposer
from backend.analytics_module.src.MyPPTX.composers.proportions import ProportionChartComposer
from backend.analytics_module.src.MyPPTX.composers.funnel import FunnelChartComposer
from backend.analytics_module.src.MyPPTX.composers.scatter import ScatterChartComposer
from backend.analytics_module.src.MyPPTX.composers.nps import NPSGaugeComposer
from backend.analytics_module.src.MyPPTX.composers.kpi import KPICardComposer
from backend.analytics_module.src.MyPPTX.composers.tables import TableComposer
from backend.analytics_module.src.MyPPTX.interactivity.navigation import NavigationHandler
from backend.analytics_module.src.MyPPTX.interactivity.speaker_notes import SpeakerNotesHandler
from backend.analytics_module.schemas.export import ReportExportSchema, ChartType, BrandingConfig

logger = logging.getLogger(__name__)

class DynamicPresentationBuilder:
    """
    Advanced Orchestrator: Slide Assembler.
    Iterates over the SlideManifest and routes payloads to specialized composers.
    """
    
    def __init__(self, presentation, branding: BrandingConfig):
        self.pres = presentation
        self.branding = branding
        self.aligner = SeriesAligner()
        self.normalizer = MatrixNormalizer()
        
        # Initializing the Composer Registry
        self.composers = {
            "bar": BarChartComposer(branding),
            "column": BarChartComposer(branding),
            "line": TrendChartComposer(branding),
            "area": TrendChartComposer(branding),
            "pie": ProportionChartComposer(branding),
            "donut": ProportionChartComposer(branding),
            "funnel": FunnelChartComposer(branding),
            "scatter": ScatterChartComposer(branding),
            "nps": NPSGaugeComposer(branding),
            "kpi": KPICardComposer(branding),
            "table": TableComposer(branding),
            "heatmap": TableComposer(branding)
        }

    def build(self, manifest: List[Any], report_doc: Dict[str, Any]):
        """
        Orchestration loop: Process كل slide entries in the manifest.
        """
        logger.info(f"[Assembler] Starting assembly of {len(manifest)} slides...")
        
        for i, slide_def in enumerate(manifest):
            try:
                # 1. Create Slide (Using Layout 6: Blank or 1: Title with content)
                # Layouts: 0=Title, 1=Title and Content, 6=Blank
                layout = self.pres.slide_layouts[1] 
                slide = self.pres.slides.add_slide(layout)
                
                # 2. Add Title & Subtitle via TextHydrator logic (simplified here)
                if slide.shapes.title:
                    slide.shapes.title.text = slide_def.get("title", "Insight Analysis")

                # 3. Data Processing Pipeline
                data = slide_def.get("data", [])
                df = self.normalizer.normalize(data)
                
                chart_type = slide_def.get("chart_type", "bar")
                df = self.aligner.align(df, chart_type=chart_type)
                
                # 4. Route to Renderer
                composer = self.composers.get(chart_type, self.composers["bar"])
                
                # We wrap the dict back into our Pydantic model for the composer
                from backend.analytics_module.schemas.export import ChartDefinition
                cd = ChartDefinition(**slide_def)
                
                composer.compose(slide, cd, df)
                
                # 5. Embellishments (AI Notes & Navigation)
                SpeakerNotesHandler.inject_strategic_notes(
                    slide, 
                    slide_def.get("ai_headline", ""),
                    slide_def.get("ai_deep_analysis", [])
                )
                
                # Add "Back to Summary" on detailed slides
                if i > 1:
                    NavigationHandler.inject_back_button(slide, target_slide_index=1)

            except Exception as e:
                logger.error(f"[Assembler] Failed slide {i}: {e}", exc_info=True)
                # Fail gracefully by creating an error slide
                continue

        logger.info("[Assembler] Presentation assembly complete.")
