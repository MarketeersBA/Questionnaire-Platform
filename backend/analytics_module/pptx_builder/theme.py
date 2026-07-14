import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
from pptx.dml.color import RGBColor
from pptx.util import Pt
from backend.analytics_module.schemas.export import BrandingConfig

class PPTXTheme:
    """
    Advanced Design System for PPTX.
    Dynamically loads executive color palettes and chart themes from JSON.
    """
    
    def __init__(self, theme_name: str = "Executive", branding: Optional[BrandingConfig] = None):
        self.resource_dir = Path("backend/resources/analytics")
        self.colors = self._load_json(self.resource_dir / "colors.json")
        self.chart_themes = self._load_json(self.resource_dir / "chart_themes.json")
        self.branding = branding or BrandingConfig()
        
        self.current_theme = self.chart_themes.get("themes", {}).get(theme_name, {})
        self.base_theme = self.chart_themes.get("themes", {}).get("BaseExecutive", {})

        # Typography (Premium Font Cluster)
        self.FONT_BOLD = "Pangram Bold"
        self.FONT_MEDIUM = "Pangram"
        self.FONT_LIGHT = "Pangram Light"
        
        # Effect Presets
        self.BORDER_WIDTH = Pt(0.75)
        self.BORDER_COLOR = self.get_rgb_by_name("brand_slate")
        self.SHADOW_ENABLED = True
        
        self.TITLE_SIZE = Pt(22)
        self.SUBTITLE_SIZE = Pt(13)
        self.FOOTNOTE_SIZE = Pt(8)
        self.DATA_LABEL_SIZE = Pt(9)

        # Resolved Colors
        self.TEXT_COLOR = self.get_rgb_by_name("brand_navy")
        self.SUBTITLE_COLOR = self.get_rgb_by_name("brand_slate")
        self.PRIMARY_BRAND = self.get_rgb_by_name("brand_navy")
        
    def _load_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_rgb_by_name(self, color_name: str) -> RGBColor:
        """Resolves a color name (e.g. 'brand_navy') to an RGBColor object."""
        color_pool = self.colors.get("custom_colors", {})
        rgb_list = color_pool.get(color_name)
        
        if not rgb_list:
            # Fallback to css_colors
            rgb_list = self.colors.get("css_colors", {}).get(color_name, [0, 0, 0])
            
        return RGBColor(*rgb_list)

    def get_color_palette(self) -> List[RGBColor]:
        """Returns the full brand palette as per the current theme."""
        palette_names = self.current_theme.get("color_palette", [])
        return [self.get_rgb_by_name(name) for name in palette_names]

    def get_color(self, index: int) -> RGBColor:
        """Returns a stable color from the palette."""
        palette = self.get_color_palette()
        if not palette:
            return RGBColor(0, 31, 63) # Default Navy
        return palette[index % len(palette)]

    def get_branding_primary(self) -> RGBColor:
        return self._hex_to_rgb(self.branding.primary_color, fallback=self.get_rgb_by_name("brand_navy"))

    def get_branding_secondary(self) -> RGBColor:
        return self._hex_to_rgb(self.branding.secondary_color, fallback=self.get_rgb_by_name("brand_emerald"))

    def get_branding_accent(self) -> RGBColor:
        return self._hex_to_rgb(self.branding.accent_color, fallback=self.get_rgb_by_name("brand_pink"))

    def get_nps_palette(self) -> List[RGBColor]:
        """Detractor, Passive, Promoter colors bound to brand theme."""
        return [
            self.get_rgb_by_name("brand_crimson"),
            self.get_rgb_by_name("brand_gray"),
            self.get_branding_secondary(),
        ]

    def get_swot_palette(self) -> Dict[str, RGBColor]:
        return {
            "strengths": self.get_branding_secondary(),
            "weaknesses": self.get_rgb_by_name("brand_crimson"),
            "opportunities": self.get_branding_primary(),
            "threats": self.get_branding_accent(),
        }

    def get_recommendation_palette(self) -> Dict[str, RGBColor]:
        return {
            "product": self.get_branding_primary(),
            "price": self.get_branding_secondary(),
            "place": self.get_branding_accent(),
            "promotion": self.get_rgb_by_name("brand_2_blue"),
        }

    @staticmethod
    def _hex_to_rgb(value: str, fallback: RGBColor) -> RGBColor:
        if not value:
            return fallback
        raw = value.strip().lstrip("#")
        if len(raw) != 6:
            return fallback
        try:
            return RGBColor(int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16))
        except Exception:
            return fallback
