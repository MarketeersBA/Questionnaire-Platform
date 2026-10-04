"""Canonical constants for packaging heatmap feature."""

from typing import Final, Literal, Tuple

PACKAGING_IMAGE_BUCKET: Final[str] = "packaging_images"

PackagingImageSide = Literal["front", "back"]
PackagingHeatmapIntent = Literal["attraction", "dislikes", "improve"]

PACKAGING_IMAGE_SIDES: Tuple[PackagingImageSide, ...] = ("front", "back")
PACKAGING_HEATMAP_INTENTS: Tuple[PackagingHeatmapIntent, ...] = (
    "attraction",
    "dislikes",
    "improve",
)

ALLOWED_PACKAGING_IMAGE_MIMES: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})

ALLOWED_PACKAGING_IMAGE_EXTENSIONS: frozenset[str] = frozenset({
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
})

PACKAGING_HEATMAP_GRID_SIZE: Final[int] = 32

# Must equal PACKAGING_HEATMAP_MAX_REGIONS in
# frontend/src/utils/packagingHeatmapSnapshot.ts — both composers write this
# into the same `max_clicks`/`maxClicks` snapshot field, so the cap a
# respondent actually gets is decided by whichever one composed their survey.
# This used to sit alongside a second constant, PACKAGING_HEATMAP_MAX_CLICKS
# = 30, that was imported but never read: the rename to _MAX_PINS was applied
# here and not on the frontend, which is how the two sides came to disagree
# (30 vs 10) without anything failing.
PACKAGING_HEATMAP_MAX_PINS: Final[int] = 30

MIME_TO_EXTENSION: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
