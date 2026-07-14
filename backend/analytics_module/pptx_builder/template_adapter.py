from typing import Dict, Any, Optional
import logging
from pptx.slide import SlideLayout
from pptx import Presentation

logger = logging.getLogger(__name__)

class TemplateAdapter:
    """
    Named-role mapping for Marketeers Template 2025.
    Resolves layout names -> indices dynamically, not by position.
    Ensures deck stability even if the template is re-ordered.
    """
    
    # Canonical ROLE_MAP for Marketeers Template 2025
    ROLE_MAP = {
        "cover":              "Title Slide",           
        "content":            "Title and Content",     
        "survey_overview":    "1_Title and Content",   
        "section_divider":    "Two Content",           
        "closing":            "3_Custom Layout",       
        "blank":              "Blank",                 
        "ai_narrative":       "Title Only",            
    }

    # Backup Map (Index-based) if name lookup fails
    BACKUP_MAP = {
        "cover": 0,
        "content": 1,
        "survey_overview": 3,
        "section_divider": 6,
        "closing": 10,
        "blank": 6,        
        "ai_narrative": 1, 
    }

    def __init__(self):
        self._cache: Dict[str, int] = {}

    def get_layout(self, prs: Presentation, role: str) -> SlideLayout:
        """
        Retrieves a SlideLayout by its logical role.
        First attempts name-based resolution, then falls back to known stable indices.
        """
        if role in self._cache:
            return prs.slide_layouts[self._cache[role]]

        target_name = self.ROLE_MAP.get(role)
        if not target_name:
            logger.error(f"[TemplateAdapter] Unknown template role: '{role}'")
            return prs.slide_layouts[self.BACKUP_MAP.get(role, 1)]

        # 1. Search by name (case-insensitive)
        for i, layout in enumerate(prs.slide_layouts):
            if layout.name.lower() == target_name.lower():
                self._cache[role] = i
                logger.debug(f"[TemplateAdapter] Resolved role '{role}' -> layout '{layout.name}' (idx {i})")
                return layout

        # 2. Role-specific fallback before index backup
        if role == "ai_narrative":
            for i, layout in enumerate(prs.slide_layouts):
                if "content" in layout.name.lower():
                    self._cache[role] = i
                    logger.warning(
                        "[TemplateAdapter] Layout '%s' not found for role '%s'. Using '%s'.",
                        target_name,
                        role,
                        layout.name,
                    )
                    return layout

        # 3. Sequential fallback to index with warning
        idx = self.BACKUP_MAP.get(role, 1)
        logger.warning(f"[TemplateAdapter] Layout '{target_name}' not found for role '{role}'. Falling back to index {idx}.")
        return prs.slide_layouts[idx]

    def get_trusted_layout_indices(self, prs: Presentation) -> set[int]:
        """Returns the set of slide layout indices that are mapped to corporate roles."""
        trusted = set()
        # Ensure cache is warm for all roles
        for role in self.ROLE_MAP:
            layout = self.get_layout(prs, role)
            # Find index of this layout in prs.slide_layouts
            for i, l in enumerate(prs.slide_layouts):
                if l == layout:
                    trusted.add(i)
        return trusted

    def is_layout_trusted(self, prs: Presentation, layout: SlideLayout) -> bool:
        """Checks if a specific layout instance is within the trusted corporate roles."""
        return any(layout == self.get_layout(prs, role) for role in self.ROLE_MAP)

    def audit(self, prs: Presentation) -> Dict[str, Any]:
        """
        Performs a pre-flight structural audit of the template.
        Returns a detailed report of mapped vs missing roles.
        """
        report = {
            "found": [],
            "missing": [],
            "all_layouts": []
        }
        
        layout_names = [l.name.lower() for l in prs.slide_layouts]
        
        for role, name in self.ROLE_MAP.items():
            if name.lower() in layout_names:
                report["found"].append(f"{role} -> {name}")
            else:
                report["missing"].append(f"{role} -> {name}")
        
        for i, l in enumerate(prs.slide_layouts):
            report["all_layouts"].append({
                "index": i,
                "name": l.name,
                "placeholders": [
                    {
                        "idx": ph.placeholder_format.idx,
                        "name": ph.name,
                        "type": str(ph.placeholder_format.type),
                    }
                    for ph in l.placeholders
                ]
            })
                
        return report
