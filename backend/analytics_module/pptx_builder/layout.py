from __future__ import annotations

from typing import Any, Dict, Tuple

from pptx import Presentation
from pptx.util import Inches, Length

# Marketeers Template 2025 reference canvas (20" x 11.25")
REFERENCE_WIDTH_IN = 20.0
REFERENCE_HEIGHT_IN = 11.25
REFERENCE_WIDTH_EMU = int(REFERENCE_WIDTH_IN * 914400)
REFERENCE_HEIGHT_EMU = int(REFERENCE_HEIGHT_IN * 914400)
CHART_FRAME_PAD_IN = 0.15


class PPTXLayout:
    """
    Presentation-bound layout zones for native PPTX builders.
    Coordinates are scaled from the Marketeers reference canvas to the
    loaded presentation slide size.
    """

    def __init__(self, slide_width_emu: int, slide_height_emu: int):
        self.slide_width_emu = int(slide_width_emu)
        self.slide_height_emu = int(slide_height_emu)
        self.WIDTH = Length(self.slide_width_emu)
        self.HEIGHT = Length(self.slide_height_emu)

        self._scale_x = self.slide_width_emu / REFERENCE_WIDTH_EMU
        self._scale_y = self.slide_height_emu / REFERENCE_HEIGHT_EMU

        self.TITLE_TOP = self._y(0.6)
        self.TITLE_LEFT = self._x(0.9)
        self.TITLE_WIDTH = self._x(16.5)
        self.TITLE_HEIGHT = self._y(0.9)

        self.SUBTITLE_TOP = self._y(1.65)
        self.SUBTITLE_LEFT = self._x(0.9)
        self.SUBTITLE_WIDTH = self._x(16.5)
        self.SUBTITLE_HEIGHT = self._y(0.6)

        self.CHART_TOP = self._y(2.55)
        self.CHART_LEFT = self._x(0.9)
        self.CHART_WIDTH = self._x(18.2)
        self.CHART_HEIGHT = self._y(7.5)

        self.COLUMN_WIDTH = self._x(8.7)
        self.COL_1_LEFT = self._x(0.9)
        self.COL_2_LEFT = self._x(10.35)

        self.LOGO_TOP = self._y(0.6)
        self.LOGO_LEFT = self._x(17.7)
        self.LOGO_WIDTH = self._x(1.5)
        self.LOGO_HEIGHT = self._y(0.9)

        self.FOOTNOTE_TOP = self._y(10.5)
        self.FOOTNOTE_LEFT = self._x(0.9)
        self.FOOTNOTE_WIDTH = self._x(18.2)
        self.FOOTNOTE_HEIGHT = self._y(0.45)

    @classmethod
    def for_reference(cls) -> "PPTXLayout":
        """Layout matching the canonical Marketeers template dimensions."""
        return cls(REFERENCE_WIDTH_EMU, REFERENCE_HEIGHT_EMU)

    @classmethod
    def from_presentation(cls, presentation: Presentation) -> "PPTXLayout":
        """Bind layout geometry to an opened template or presentation."""
        return cls(presentation.slide_width, presentation.slide_height)

    @classmethod
    def from_dimensions(cls, width_in: float, height_in: float) -> "PPTXLayout":
        return cls(int(width_in * 914400), int(height_in * 914400))

    def _x(self, inches: float) -> Length:
        return Inches(inches * self._scale_x)

    def _y(self, inches: float) -> Length:
        return Inches(inches * self._scale_y)

    def chart_frame_bounds(self) -> Tuple[Length, Length, Length, Length]:
        """
        Outer chart card bounds used by slide chrome and geometry validation.
        Returns (left, top, width, height).
        """
        pad_x = self._x(CHART_FRAME_PAD_IN)
        pad_y = self._y(CHART_FRAME_PAD_IN)
        left = self.CHART_LEFT - pad_x
        top = self.CHART_TOP - pad_y
        width = self.CHART_WIDTH + (pad_x * 2)
        height = self.CHART_HEIGHT + (pad_y * 2)
        return left, top, width, height

    def chart_body_bounds(self) -> Tuple[Length, Length, Length, Length]:
        """Inner chart body bounds where builders should place native chart content."""
        return self.CHART_LEFT, self.CHART_TOP, self.CHART_WIDTH, self.CHART_HEIGHT

    def dual_chart_bounds(self, gap_in: float = 0.4, split_ratio: float = 0.5) -> Tuple[
        Tuple[Length, Length, Length, Length],
        Tuple[Length, Length, Length, Length],
    ]:
        """
        Calculates side-by-side chart panels for dual-viz slides.
        Advanced geometry engine supports custom split ratios and gap padding.
        
        Returns two tuples of (left, top, width, height).
        """
        gap = self._x(gap_in)
        total_w = int(self.CHART_WIDTH)
        
        # Calculate panel widths based on ratio
        left_w = Length(int((total_w - int(gap)) * split_ratio))
        right_w = Length(int(total_w - int(gap) - int(left_w)))
        
        left_bounds = (self.CHART_LEFT, self.CHART_TOP, left_w, self.CHART_HEIGHT)
        
        right_left = Length(int(self.CHART_LEFT) + int(left_w) + int(gap))
        right_bounds = (right_left, self.CHART_TOP, right_w, self.CHART_HEIGHT)
        
        return left_bounds, right_bounds

    def chart_frame_fits_slide(self, margin_emu: int = 0) -> bool:
        """True when the chart frame lies fully inside the slide canvas."""
        left, top, width, height = self.chart_frame_bounds()
        right = int(left) + int(width)
        bottom = int(top) + int(height)
        return (
            int(left) >= margin_emu
            and int(top) >= margin_emu
            and right <= self.slide_width_emu - margin_emu
            and bottom <= self.slide_height_emu - margin_emu
        )

    def shape_fits_slide(
        self,
        left: int,
        top: int,
        width: int,
        height: int,
        *,
        margin_emu: int = 0,
    ) -> bool:
        right = left + width
        bottom = top + height
        return (
            left >= margin_emu
            and top >= margin_emu
            and right <= self.slide_width_emu - margin_emu
            and bottom <= self.slide_height_emu - margin_emu
        )

    def geometry_manifest(self) -> Dict[str, Any]:
        frame_left, frame_top, frame_width, frame_height = self.chart_frame_bounds()
        body_left, body_top, body_width, body_height = self.chart_body_bounds()
        return {
            "slide_width_emu": self.slide_width_emu,
            "slide_height_emu": self.slide_height_emu,
            "scale_x": self._scale_x,
            "scale_y": self._scale_y,
            "chart_frame_fits_slide": self.chart_frame_fits_slide(),
            "chart_frame": {
                "left": int(frame_left),
                "top": int(frame_top),
                "width": int(frame_width),
                "height": int(frame_height),
            },
            "chart_body": {
                "left": int(body_left),
                "top": int(body_top),
                "width": int(body_width),
                "height": int(body_height),
            },
        }
