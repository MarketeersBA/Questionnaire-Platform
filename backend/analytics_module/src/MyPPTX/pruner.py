"""
Presentation Pruner — Phase 5, Task 1.
Systematic removal of template blueprints and visual artifacts.
Ensures the final PPTX is lean, professional, and free of placeholder noise.
"""
import logging
from typing import List

logger = logging.getLogger(__name__)

class PresentationPruner:
    """
    The 'Cleaner' module. 
    Handles the final destruction of source artifacts and cleanup of empty shapes.
    """

    @staticmethod
    def prune_output(prs, original_template_count: int):
        """
        Orchestrates the final presentation cleanup sweep.
        """
        # 1. Remove Blueprint Slides (The Palette)
        # We proceed in reverse order to ensure index stability
        PresentationPruner._remove_template_slides(prs, original_template_count)

        # 2. Remove Zombie Shapes
        # Sweeps for empty text boxes that were not hydrated due to null AI insights
        PresentationPruner._remove_empty_shapes(prs)

    @staticmethod
    def _remove_template_slides(prs, count: int):
        """
        Deletes the first N slides of the presentation.
        These are the source archetypes used for cloning.
        """
        logger.info(f"[Pruner] Pruning {count} source blueprints.")
        
        # Guard: Ensure we don't delete everything if count is wrong
        if count >= len(prs.slides):
            logger.warning("[Pruner] Prune count >= total slides. Adjusting to safely keep the generated content.")
            count = max(0, len(prs.slides) - 1)

        # Slides are 0-indexed. We delete from count-1 down to 1.
        # We typically preserve Slide 0 if it was treated as the 'Live' Cover.
        for i in reversed(range(count)):
            if i == 0:
                continue # Preserve the Cover
            
            try:
                # low-level XML removal for guaranteed reference cleanup
                rId = prs.slides._sldIdLst[i].rId
                prs.part.drop_rel(rId)
                del prs.slides._sldIdLst[i]
            except Exception as e:
                logger.error(f"[Pruner] Failed to drop slide {i}: {e}")

    @staticmethod
    def _remove_empty_shapes(prs):
        """
        Scans all generated slides for empty text placeholders.
        """
        for slide in prs.slides:
            zombies = []
            for shape in slide.shapes:
                # We target text frames that are purely empty or whitespace
                if shape.has_text_frame:
                    if not shape.text_frame.text.strip():
                        # Only delete them if they aren't part of the core master layout
                        # (shapes directly on the slide are fair game)
                        zombies.append(shape)
            
            # Perform the cleanup
            for shape in zombies:
                try:
                    sp = shape.element
                    sp.getparent().remove(sp)
                except Exception:
                    pass
        
        logger.info("[Pruner] Zombie cleanup complete.")
